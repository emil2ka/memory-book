// Дорисовка на клиенте: слово → предмет-картинка (KitPicture, SVG).
// Порядок: библиотека по слову → кэш браузера (IndexedDB) → /api/make (Claude рисует SVG) → похожий по тегам → кристалл.
// Всё, что пришло от сервера, ещё раз проходит validatePicture: в сцену попадает только проверенное.
import type { KitModel } from './format'
import { findByName, findByWord, makeKey, normWord, registerExtra, similar } from './library'
import { pictureById } from './pictures'
import { validatePicture, type KitPicture } from './svg'
import { aiOff } from './aiLimit'

export type MakeSource = 'library' | 'cache' | 'claude' | 'similar' | 'crystal'

export interface MakeRequest {
  name: string
  hint?: string
  tags?: string[]
}

export interface MakeResult {
  model: KitPicture
  source: MakeSource
  /** Почему не Claude (для отладки и «Почему так»). */
  reason?: string
}

export interface MakeOptions {
  endpoint?: string
  /** Клиентский таймаут; сервер укладывается в 12 с, плюс сеть. */
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** Не ходить в сеть: только библиотека, кэш и запасные. */
  offline?: boolean
}

export { makeKey } from './library'

// ---------- кэш в IndexedDB ----------

const DB = 'memory-book-kit'
const STORE = 'made'
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

interface CachedKit {
  key: string
  model: KitPicture
  createdAt: number
}

/** Дорисованный предмет в поиске библиотеки: только поля поиска, без фигур. */
const asSearchable = (p: KitPicture): KitModel => ({ id: p.id, ru: p.ru, kk: p.kk, en: p.en, stems: p.stems, tags: p.tags, hold: p.hold, parts: [], by: 'claude' })
const madePictures = new Map<string, KitPicture>()
const remember = (p: KitPicture) => {
  madePictures.set(p.id, p)
  registerExtra([asSearchable(p)])
}
/** Картинка по id: библиотека или дорисованное в этом браузере. */
export const pictureFor = (id: string): KitPicture | null => pictureById(id) ?? madePictures.get(id) ?? null

async function cacheGet(key: string): Promise<KitPicture | null> {
  const p = db()
  if (!p) return null
  try {
    const d = await p
    const rec = await new Promise<CachedKit | undefined>((resolve, reject) => {
      const r = d.transaction(STORE).objectStore(STORE).get(key)
      r.onsuccess = () => resolve(r.result as CachedKit | undefined)
      r.onerror = () => reject(r.error)
    })
    if (!rec) return null
    const check = validatePicture(rec.model)
    return check.ok ? { ...check.picture!, by: 'claude' } : null
  } catch {
    return null
  }
}

async function cachePut(key: string, model: KitPicture): Promise<void> {
  const p = db()
  if (!p) return
  try {
    const d = await p
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ key, model, createdAt: Date.now() } satisfies CachedKit)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* кэш — не обязательный */
  }
}

/** Все дорисованные раньше предметы (для поиска по слову и витрины). */
export async function loadMadeKits(): Promise<KitPicture[]> {
  const p = db()
  if (!p) return []
  try {
    const d = await p
    const all = await new Promise<CachedKit[]>((resolve, reject) => {
      const r = d.transaction(STORE).objectStore(STORE).getAll()
      r.onsuccess = () => resolve(r.result as CachedKit[])
      r.onerror = () => reject(r.error)
    })
    const ok = all.map((c) => validatePicture(c.model)).filter((c) => c.ok).map((c) => ({ ...c.picture!, by: 'claude' as const }))
    ok.forEach(remember)
    return ok
  } catch {
    return []
  }
}

/** Закрыть базу (тесты). */
export async function closeKitDb(): Promise<void> {
  if (!dbp) return
  try {
    ;(await dbp).close()
  } finally {
    dbp = null
  }
}

// ---------- запасные ----------

/** Кристалл — последний запасной вариант: светится, подходит к любому слову. */
export function crystalKit(): KitPicture {
  return pictureById('crystal')!
}

/** Похожий предмет из библиотеки по тегам, иначе кристалл. */
export function fallbackKit(tags: readonly string[] = []): MakeResult {
  if (tags.length) {
    // совпадение хотя бы по двум тегам, иначе похожесть случайная; только то, что нарисовано
    for (const m of similar(tags, 8, { exclude: ['crystal'] })) {
      const p = m.tags.filter((t) => tags.includes(t)).length >= 2 ? pictureById(m.id) : null
      if (p) return { model: p, source: 'similar' }
    }
  }
  return { model: crystalKit(), source: 'crystal' }
}

// ---------- главное ----------

const inflight = new Map<string, Promise<MakeResult>>()

/** Предмет по слову. Никогда не бросает: в худшем случае — кристалл. */
export function makeKit(req: MakeRequest, opts: MakeOptions = {}): Promise<MakeResult> {
  const key = makeKey(req.name)
  // составное название не дробим: «швейная машинка» — не машина
  const lib = key.includes(' ') ? findByName(key) : findByWord(req.name) ?? findByName(key)
  const libPic = lib ? pictureFor(lib.id) : null
  if (libPic) return Promise.resolve({ model: libPic, source: lib!.by === 'claude' ? 'cache' : 'library' })
  if (!key) return Promise.resolve(fallbackKit(req.tags))
  // лимит дней с ИИ исчерпан (src/kit/aiLimit) — без дорисовки: похожий предмет или кристалл
  if (aiOff()) return Promise.resolve(fallbackKit(req.tags))
  // один и тот же предмет просят дважды (повтор фильма, два бита) — один запрос
  let p = inflight.get(key)
  if (!p) {
    p = makeUncached(key, req, opts).finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}

async function makeUncached(key: string, req: MakeRequest, opts: MakeOptions): Promise<MakeResult> {
  const cached = await cacheGet(key)
  if (cached) {
    remember(cached)
    return { model: cached, source: 'cache' }
  }
  if (opts.offline) return { ...fallbackKit(req.tags), reason: 'offline' }

  const f = opts.fetchImpl ?? fetch
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 13500)
  try {
    const r = await f(opts.endpoint ?? '/api/make', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: req.name, hint: req.hint ?? '', tags: req.tags ?? [] }),
      signal: ac.signal,
    })
    if (!r.ok) {
      const err = (await r.json().catch(() => ({}))) as { error?: string }
      return { ...fallbackKit(req.tags), reason: err.error ?? `http ${r.status}` }
    }
    const check = validatePicture(await r.json(), { fit: true })
    if (!check.ok) return { ...fallbackKit(req.tags), reason: 'invalid' }
    const model: KitPicture = { ...check.picture!, by: 'claude' }
    // слово, по которому просили, тоже находит предмет в следующий раз
    const word = normWord(req.name.split(/\s+/)[0] ?? '')
    if (word.length >= 3 && !model.stems.includes(word)) model.stems = [...model.stems, `${word}$`]
    await cachePut(key, model)
    remember(model)
    return { model, source: 'claude' }
  } catch (e) {
    return { ...fallbackKit(req.tags), reason: ac.signal.aborted ? 'timeout' : e instanceof Error ? e.name : 'network' }
  } finally {
    clearTimeout(timer)
  }
}
