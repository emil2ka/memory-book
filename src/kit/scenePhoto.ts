// Карточка снимка (роль фото, план 14 А+Б): POST /api/photo → PhotoCard, кэш по хэшу снимка в IndexedDB.
// Просить СРАЗУ, как фото добавлено в запись (requestPhotoCard) — к «Собрать день» карточка уже готова.
// Без сети или ключа — карточки нет (null), всё работает как раньше. Никогда не бросает.
// sanitizePhotoCard — общий для сервера (api/photo.ts) и клиента.
import { PALETTE, type PaletteName } from '../scene/palette'
import type { PhotoAccessory, PhotoAction, PhotoCard, PhotoWhere, TimeOfDay, Weather } from '../types/script'
import { sceneRef } from './sceneCheck'
import { aiOff } from './aiLimit'

const WHERE: readonly PhotoWhere[] = ['hand', 'table', 'ground', 'wall', 'sky']
const ACCESSORIES: readonly PhotoAccessory[] = ['none', 'cap', 'bun', 'headscarf', 'kalpak', 'glasses', 'moustache', 'long_hair']
const ACTIONS: readonly PhotoAction[] = ['idle', 'cheer', 'drink', 'carry', 'sit', 'shiver', 'shake']
const TIMES: readonly TimeOfDay[] = ['morning', 'day', 'evening', 'night']
const WEATHERS: readonly Weather[] = ['clear', 'cloudy', 'rain', 'snow', 'fog']
const isColor = (c: unknown): c is PaletteName => typeof c === 'string' && c in PALETTE
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '')
/** ref — только объёмный предмет библиотеки, иначе "". */
const ref3d = (v: unknown) => {
  const id = str(v, 40)
  return id && sceneRef(id) ? id : ''
}

/** Привести ответ к PhotoCard: ссылки только на 3D-библиотеку, цвета только из палитры, не больше 4 вещей и 3 людей. */
export function sanitizePhotoCard(raw: unknown): PhotoCard | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const place = (r.place && typeof r.place === 'object' ? r.place : {}) as Record<string, unknown>
  const things = (Array.isArray(r.things) ? r.things : [])
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => ({ ru: str(t.ru, 40), ref: ref3d(t.ref), where: WHERE.includes(t.where as PhotoWhere) ? (t.where as PhotoWhere) : 'table' }))
    .filter((t) => t.ru || t.ref)
    .slice(0, 4)
  const people = (Array.isArray(r.people) ? r.people : [])
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      role: str(p.role, 30) || 'друг',
      jacket: isColor(p.jacket) ? p.jacket : 'slate',
      scarf: isColor(p.scarf) ? p.scarf : 'brick',
      hair: isColor(p.hair) ? p.hair : 'brown',
      accessory: ACCESSORIES.includes(p.accessory as PhotoAccessory) ? (p.accessory as PhotoAccessory) : 'none',
      action: ACTIONS.includes(p.action as PhotoAction) ? (p.action as PhotoAction) : 'idle',
    }))
    .slice(0, 3)
  const card: PhotoCard = {
    caption: str(r.caption, 80),
    place: { ru: str(place.ru, 40), ref: ref3d(place.ref) },
    things,
    people,
    time_of_day: TIMES.includes(r.time_of_day as TimeOfDay) ? (r.time_of_day as TimeOfDay) : 'day',
    weather: WEATHERS.includes(r.weather as Weather) ? (r.weather as Weather) : 'clear',
    palette: (Array.isArray(r.palette) ? r.palette : []).filter(isColor).slice(0, 6),
    mood: str(r.mood, 40),
    match: str(r.match, 300),
  }
  // пустая карточка (ничего не увидено) — не карточка
  if (!card.caption && !card.place.ru && !card.things.length && !card.people.length) return null
  return card
}

/** Карточка одной строкой — для режиссёра (вместо картинки) и «Почему так». */
export function photoCardText(c: PhotoCard, i: number): string {
  const people = c.people.map((p) => `${p.role} (куртка ${p.jacket}, шарф ${p.scarf})`).join(', ')
  return [
    `Фото ${i}: «${c.caption}»`,
    c.place.ru ? `место: ${c.place.ru}${c.place.ref ? ` [${c.place.ref}]` : ''}` : '',
    c.things.length ? `вещи: ${c.things.map((t) => `${t.ru}${t.ref ? ` [${t.ref}]` : ''}`).join(', ')}` : '',
    people ? `люди: ${people}` : '',
    `${c.time_of_day}, ${c.weather}`,
    c.mood ? `настроение: ${c.mood}` : '',
    c.match ? `похоже на фразу: «${c.match}»` : '',
  ]
    .filter(Boolean)
    .join('; ')
}

// ---------- клиент ----------

/** Короткий хэш снимка (FNV-1a по data URL): тот же снимок — та же карточка. */
export function photoHash(dataUrl: string): string {
  let h = 0x811c9dc5
  // весь data URL длинный — берём каждый 7-й символ и длину: быстро и без коллизий на практике
  for (let i = 0; i < dataUrl.length; i += 7) {
    h ^= dataUrl.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `${(h >>> 0).toString(16).padStart(8, '0')}_${dataUrl.length.toString(36)}`
}

const DB = 'memory-book-photo'
const STORE = 'cards'
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
async function cacheGet(key: string): Promise<PhotoCard | null> {
  const p = db()
  if (!p) return null
  try {
    const d = await p
    const rec = await new Promise<{ card: unknown } | undefined>((resolve, reject) => {
      const r = d.transaction(STORE).objectStore(STORE).get(key)
      r.onsuccess = () => resolve(r.result as { card: unknown } | undefined)
      r.onerror = () => reject(r.error)
    })
    return rec ? sanitizePhotoCard(rec.card) : null
  } catch {
    return null
  }
}
async function cachePut(key: string, card: PhotoCard): Promise<void> {
  const p = db()
  if (!p) return
  try {
    const d = await p
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ key, card, createdAt: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* кэш — не обязательный */
  }
}

/** Закрыть базу (тесты). */
export async function closePhotoDb(): Promise<void> {
  if (!dbp) return
  try {
    ;(await dbp).close()
  } finally {
    dbp = null
  }
}

const ready = new Map<string, PhotoCard>()
const inflight = new Map<string, Promise<PhotoCard | null>>()

export interface PhotoCardOptions {
  endpoint?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

/**
 * Карточка снимка. Вызывать сразу, как фото добавлено (day — что уже написано: по нему ищется фраза match).
 * Кэш → сервер; без сети — null. Повторный вызов для того же снимка ждёт уже идущий запрос.
 */
export function requestPhotoCard(dataUrl: string, day = '', opts: PhotoCardOptions = {}): Promise<PhotoCard | null> {
  const key = photoHash(dataUrl)
  const have = ready.get(key)
  if (have) return Promise.resolve(have)
  const going = inflight.get(key)
  if (going) return going
  const run = (async (): Promise<PhotoCard | null> => {
    const cached = await cacheGet(key)
    if (cached) return cached
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
    // лимит дней с ИИ исчерпан (src/kit/aiLimit) — карточки нет, снимок всё равно в фильме
    if (aiOff()) return null
    const f = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null)
    if (!f) return null
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 15000)
    try {
      const res = await f(opts.endpoint ?? '/api/photo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: dataUrl, day: day.slice(0, 3000) }),
        signal: ac.signal,
      })
      if (!res.ok) return null
      const card = sanitizePhotoCard(await res.json())
      if (card) void cachePut(key, card)
      return card
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  })().then((c) => {
    inflight.delete(key)
    if (c) ready.set(key, c)
    return c
  })
  inflight.set(key, run)
  return run
}

/** Готовая карточка снимка (синхронно) или null. */
export const photoCardFor = (dataUrl: string): PhotoCard | null => ready.get(photoHash(dataUrl)) ?? null

/**
 * Карточки всех снимков дня по индексу: готовые — сразу, идущие — ждём не дольше waitMs, не начатые — начинаем.
 * Не готово к сроку — null на этом месте (режиссёр получит картинку).
 */
export async function photoCardsFor(dataUrls: readonly string[], day = '', waitMs = 6000, opts: PhotoCardOptions = {}): Promise<(PhotoCard | null)[]> {
  const all = dataUrls.map((u) => requestPhotoCard(u, day, opts))
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), waitMs))
  return Promise.all(all.map((p) => Promise.race([p, timeout])))
}
