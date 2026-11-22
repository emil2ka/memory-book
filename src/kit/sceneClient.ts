// Сценки на клиенте: makeScene(req) спрашивает POST /api/scene и кэширует ответ в IndexedDB
// (ключ — нормализованная цитата + хэш текста дня), без сети собирает запасную сценку из библиотеки.
// Никогда не бросает. sceneFor(quote) — синхронно для сцены: последняя готовая сценка этой цитаты.
import type { KitModel } from './format'
import { findByName, findInText } from './library'
import type { KitScene, SceneObject, SceneRequest } from './scene'
import { ROLE_HEIGHT, ROLE_WIDTH, SCENE_ACTIONS_SET, fitHeight, sceneFromRef, sceneRef } from './sceneCheck'
import { validateKit } from './validate'

export type SceneSource = 'claude' | 'cache' | 'fallback'

export interface SceneResult {
  scene: KitScene
  source: SceneSource
  /** почему запасной вариант (для отладки) */
  reason?: string
}

export interface MakeSceneOptions {
  endpoint?: string
  /** Сколько ждать сервер; у сервера свой бюджет 12 с. */
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** Без сети: сразу запасной вариант (после кэша). */
  offline?: boolean
}

// ---------- ключи ----------

/** Цитата без регистра, ё/е, пунктуации и лишних пробелов. */
export const normQuote = (q: string) =>
  q
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

/** Короткий хэш текста дня (FNV-1a, 8 hex): та же цитата в другом дне — другая сценка. */
export function dayHash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

export const sceneKey = (req: Pick<SceneRequest, 'quote' | 'day'>) => `${normQuote(req.quote)}|${dayHash(req.day.trim())}`

// ---------- память для сцены ----------

const ready = new Map<string, KitScene>()

/** Готовая сценка для цитаты (синхронно, для сцены). null — ещё не пришла или не запрашивалась. */
export function sceneFor(quote: string): KitScene | null {
  return ready.get(normQuote(quote)) ?? null
}

/** Положить сценку в память (её увидит sceneFor). */
export function rememberScene(scene: KitScene): void {
  ready.set(normQuote(scene.quote), scene)
}

/** Забыть все сценки в памяти (новый день, тесты). */
export function forgetScenes(): void {
  ready.clear()
}

// ---------- проверка готовой сценки (ответ сервера или кэш) ----------

/** Привести KitScene к рабочему виду: ref — объёмный предмет библиотеки, model проходит проверку. null — пусто. */
export function sanitizeScene(raw: unknown, quote: string): KitScene | null {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<KitScene>
  const objects: SceneObject[] = []
  let hand = false
  for (const o of Array.isArray(s.objects) ? s.objects.slice(0, 3) : []) {
    if (!o || typeof o !== 'object') continue
    const role = o.role === 'hand' || o.role === 'stand' || o.role === 'detail' ? (hand && o.role === 'hand' ? 'detail' : o.role) : 'detail'
    if (o.ref) {
      const m = sceneRef(o.ref)
      if (!m?.parts.length) continue
      objects.push({ role, ru: o.ru || m.ru, ref: m.id, side: o.side })
    } else if (o.model) {
      const check = validateKit(o.model, { fit: true, heightSlack: 1e3 })
      if (!check.ok || !check.model) continue
      const [lo, hi] = ROLE_HEIGHT[role]
      objects.push({ role, ru: o.ru || check.model.ru, model: { ...check.model, parts: fitHeight(check.model.parts, lo, hi, ROLE_WIDTH[role]), by: 'claude' }, side: o.side })
    } else continue
    if (role === 'hand') hand = true
  }
  if (!objects.length) return null
  const action = SCENE_ACTIONS_SET.has(s.action as string) ? (s.action as KitScene['action']) : 'idle'
  return { quote, action, objects, by: s.by === 'fallback' ? 'fallback' : 'claude' }
}

// ---------- запасной вариант без сети ----------

/**
 * Сценка из библиотеки: первое объёмное слово цитаты (или подсказка режиссёра) — в руки, если его берут,
 * иначе декорацией; второе подходящее слово — деталью. Ничего не нашлось — кристалл в руках.
 */
export function fallbackScene(req: SceneRequest): KitScene {
  const found: KitModel[] = []
  const add = (m: KitModel | null | undefined) => {
    if (m && m.parts.length && !found.some((x) => x.id === m.id)) found.push(m)
  }
  for (const h of findInText(req.quote)) add(sceneRef(h.id))
  if (req.hint) add(sceneRef(req.hint) ?? (findByName(req.hint) ? sceneRef(findByName(req.hint)!.id) : undefined))
  if (!found.length) add(sceneRef('crystal'))
  if (!found.length) return { quote: req.quote, action: 'idle', objects: [], by: 'fallback' }
  const scene = sceneFromRef(req.quote, found[0])
  // второе слово: если в руках уже есть — встаёт рядом, иначе берётся в руки
  const second = found[1]
  if (second) {
    const hasHand = scene.objects.some((o) => o.role === 'hand')
    const want = second.scene ?? (second.hold === 'ground' ? 'stand' : 'hand')
    const role = want === 'stand' ? (scene.objects.some((o) => o.role === 'stand') ? 'detail' : 'stand') : want === 'hand' && !hasHand ? 'hand' : 'detail'
    scene.objects.push({ role, ru: second.ru, ref: second.id, side: role === 'stand' ? 'back' : role === 'hand' ? 'front' : 'right' })
  }
  return scene
}

// ---------- кэш в IndexedDB ----------

const DB = 'memory-book-scene'
const STORE = 'scenes'
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

interface CachedScene {
  key: string
  scene: KitScene
  createdAt: number
}

async function cacheGet(key: string, quote: string): Promise<KitScene | null> {
  const p = db()
  if (!p) return null
  try {
    const d = await p
    const rec = await new Promise<CachedScene | undefined>((resolve, reject) => {
      const r = d.transaction(STORE).objectStore(STORE).get(key)
      r.onsuccess = () => resolve(r.result as CachedScene | undefined)
      r.onerror = () => reject(r.error)
    })
    return rec ? sanitizeScene(rec.scene, quote) : null
  } catch {
    return null
  }
}

async function cachePut(key: string, scene: KitScene): Promise<void> {
  const p = db()
  if (!p) return
  try {
    const d = await p
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ key, scene, createdAt: Date.now() } satisfies CachedScene)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* кэш — не обязательный */
  }
}

/** Закрыть базу (тесты). */
export async function closeSceneDb(): Promise<void> {
  if (!dbp) return
  try {
    ;(await dbp).close()
  } finally {
    dbp = null
  }
}

// ---------- главное ----------

/** Сценка для бита. Кэш → сервер → запасной вариант. Не бросает. */
export async function makeScene(req: SceneRequest, opts: MakeSceneOptions = {}): Promise<SceneResult> {
  const quote = (req.quote ?? '').trim()
  const day = (req.day ?? '').slice(0, 600)
  const done = (r: SceneResult): SceneResult => {
    rememberScene(r.scene)
    return r
  }
  try {
    if (!quote) return done({ scene: fallbackScene({ quote, day }), source: 'fallback', reason: 'пустая цитата' })
    const key = sceneKey({ quote, day })
    const cached = await cacheGet(key, quote)
    if (cached) return done({ scene: cached, source: 'cache' })
    if (opts.offline || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return done({ scene: fallbackScene({ ...req, quote, day }), source: 'fallback', reason: 'нет сети' })
    }
    const f = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null)
    if (!f) return done({ scene: fallbackScene({ ...req, quote, day }), source: 'fallback', reason: 'нет fetch' })
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 13500)
    try {
      const res = await f(opts.endpoint ?? '/api/scene', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ quote, day, ...(req.hint ? { hint: req.hint } : {}) }),
        signal: ac.signal,
      })
      if (!res.ok) return done({ scene: fallbackScene({ ...req, quote, day }), source: 'fallback', reason: `сервер ${res.status}` })
      const scene = sanitizeScene(await res.json(), quote)
      if (!scene) return done({ scene: fallbackScene({ ...req, quote, day }), source: 'fallback', reason: 'пустая сценка' })
      void cachePut(key, scene)
      return done({ scene, source: 'claude' })
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    return done({ scene: fallbackScene({ ...req, quote, day }), source: 'fallback', reason: e instanceof Error ? e.name : 'ошибка' })
  }
}
