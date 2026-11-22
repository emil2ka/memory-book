// Песня дня по записи и фото (план 14 § 2): человек написал день, а песню не указал — ИИ предлагает 3 настоящие
// известные песни (только названия, файлов нет — правило 7). POST /api/song → SongAdvice, кэш по хэшу текста и карточек.
// Без сети — null (фильм идёт как без песни). Никогда не бросает. sanitizeSongAdvice — общий для сервера и клиента.
import type { DirectorInput, PhotoCard, SongAdvice, SongSuggestion } from '../types/script'

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '')
const unit = (v: unknown, d = 0.5) => {
  const x = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(x) ? Math.round(Math.min(1, Math.max(0, x)) * 100) / 100 : d
}
// кавычки вокруг названия модель иногда ставит сама — убираем
const unquote = (s: string) => s.replace(/^[«"“'„]+|[»"”']+$/g, '').trim()

/** Привести ответ к SongAdvice: до 3 песен с названием и исполнителем, темп и энергия 0..1. null — ни одной песни. */
export function sanitizeSongAdvice(raw: unknown): SongAdvice | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const seen = new Set<string>()
  const songs: SongSuggestion[] = []
  for (const s of Array.isArray(r.songs) ? r.songs : []) {
    if (!s || typeof s !== 'object') continue
    const o = s as Record<string, unknown>
    const title = unquote(str(o.title, 80))
    const artist = unquote(str(o.artist, 80))
    const key = `${title}|${artist}`.toLowerCase()
    if (!title || !artist || seen.has(key)) continue
    seen.add(key)
    const yt = typeof o.yt === 'string' && /^[\w-]{11}$/.test(o.yt) ? o.yt : null
    songs.push({ title, artist, why: str(o.why, 120), tempo: unit(o.tempo), energy: unit(o.energy), ...(yt ? { yt } : {}) })
    if (songs.length === 3) break
  }
  if (!songs.length) return null
  return { songs, why: str(r.why, 120) }
}

/** Язык записи — от него зависит, какие песни предлагать. */
export function entryLanguage(text: string): 'kk' | 'ru' | 'mixed' | 'en' {
  const kk = (text.match(/[әғқңөұүһі]/gi) ?? []).length
  const cyr = (text.match(/[а-яё]/gi) ?? []).length
  const lat = (text.match(/[a-z]/gi) ?? []).length
  // в казахском тексте «свои» буквы — около десятой части; русская запись с парой казахских слов — пара процентов
  if (kk && kk >= cyr * 0.05) return 'kk'
  if (kk) return 'mixed'
  if (cyr && cyr >= lat) return 'ru'
  return 'en'
}

/**
 * Строка «Песня» в «Почему так»: как фильм подстроился под песню (план 15): характер песни → шаг человечка,
 * поворот дня — на подъёме (файл) или на смене фразы (известный темп). Песню выбрали из предложенных ИИ — откуда она.
 */
export function songAdaptWhy(song: DirectorInput['song']): string | null {
  if (!song) return null
  const bpm = song.measuredTempoBpm ?? song.bpm
  const feel = feelOf(bpm, song.energy)
  const name = [song.artist, song.title].filter(Boolean).join(' — ')
  const what = feel === 'slow' ? 'медленная песня → спокойный шаг, тёплый свет' : feel === 'fast' ? 'бодрая песня → бегом, ярче' : 'ровная песня → ровный шаг'
  const turn = song.measuredTempoBpm ? ', поворот дня — на подъёме песни' : song.bpm ? ', поворот — на смене фразы' : ''
  const tempo = bpm ? ` ${Math.round(bpm)} bpm` : ''
  if (song.suggested?.why) return `Песня: предложил ИИ по записи${song.suggested.photos ? ' и фото' : ''} — ${song.suggested.why}; ${what}${turn}`
  return `Песня: ${name ? `${name}${tempo}` : `своя${tempo}`} — ${what}${turn}`
}

const feelOf = (bpm: number | undefined, energy: number | undefined): 'slow' | 'medium' | 'fast' => {
  const e = energy ?? 0.5
  if ((bpm && bpm < 90) || (!bpm && e < 0.4)) return 'slow'
  if ((bpm && bpm >= 120 && e >= 0.45) || (!bpm && e > 0.66)) return 'fast'
  return 'medium'
}

/**
 * Строка «Песня» в «Почему так», когда песню выбрали из предложенных ИИ:
 * «Песня: предложил ИИ по записи и фото — тёплая кофейня вечером → что-то медленное и тёплое».
 */
export function suggestedSongWhy(s: NonNullable<NonNullable<DirectorInput['song']>['suggested']>): string {
  return `Песня: предложил ИИ по записи${s.photos ? ' и фото' : ''} — ${s.why}`
}

// ---------- клиент ----------

/** Ключ кэша: текст дня + что на фото (подпись, место). */
export function songKey(day: string, cards: readonly (PhotoCard | null)[]): string {
  const src = `${day.trim()}|${cards.map((c) => (c ? `${c.caption};${c.place.ru}` : '-')).join('|')}`
  let h = 0x811c9dc5
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${(h >>> 0).toString(16).padStart(8, '0')}_${src.length.toString(36)}`
}

const DB = 'memory-book-song'
const STORE = 'advice'
let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === 'undefined') return null
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}
async function cacheGet(key: string): Promise<SongAdvice | null> {
  const p = db()
  if (!p) return null
  try {
    const d = await p
    const rec = await new Promise<{ advice: unknown } | undefined>((resolve, reject) => {
      const r = d.transaction(STORE).objectStore(STORE).get(key)
      r.onsuccess = () => resolve(r.result as { advice: unknown } | undefined)
      r.onerror = () => reject(r.error)
    })
    return rec ? sanitizeSongAdvice(rec.advice) : null
  } catch {
    return null
  }
}
async function cachePut(key: string, advice: SongAdvice): Promise<void> {
  const p = db()
  if (!p) return
  try {
    const d = await p
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ key, advice, createdAt: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* кэш — не обязательный */
  }
}

/** Закрыть базу (тесты). */
export async function closeSongDb(): Promise<void> {
  if (!dbp) return
  try {
    ;(await dbp).close()
  } finally {
    dbp = null
  }
}

const inflight = new Map<string, Promise<SongAdvice | null>>()

/**
 * Три песни под этот день (по тексту и фото, если есть). Звать, когда запись написана, а песни нет.
 * Кэш → сервер; без сети — null. Повторный вызов с теми же данными ждёт уже идущий запрос.
 */
export function fetchSongAdvice(
  day: string,
  cards: readonly (PhotoCard | null)[] = [],
  opts: { endpoint?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<SongAdvice | null> {
  const text = day.trim().slice(0, 3000)
  if (!text && !cards.some(Boolean)) return Promise.resolve(null)
  const key = songKey(text, cards)
  const going = inflight.get(key)
  if (going) return going
  const run = (async (): Promise<SongAdvice | null> => {
    const cached = await cacheGet(key)
    if (cached) return cached
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
    const f = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null)
    if (!f) return null
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 15000)
    try {
      const res = await f(opts.endpoint ?? '/api/song', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ day: text, cards: cards.filter(Boolean) }),
        signal: ac.signal,
      })
      if (!res.ok) return null
      const advice = sanitizeSongAdvice(await res.json())
      if (advice) void cachePut(key, advice)
      return advice
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  })().finally(() => inflight.delete(key))
  inflight.set(key, run)
  return run
}
