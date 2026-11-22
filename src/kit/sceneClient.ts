// Сценки на клиенте: makeScene(req) спрашивает POST /api/scene и кэширует ответ в IndexedDB
// (ключ — нормализованная цитата + хэш текста дня), без сети собирает запасную сценку из библиотеки.
// Никогда не бросает. sceneFor(quote) — синхронно для сцены: последняя готовая сценка этой цитаты.
import type { KitModel } from './format'
import { findByName, findInText } from './library'
import type { Timeline } from '../types/timeline'
import { dayAround, SCENE_DAY_MAX, type KitScene, type SceneObject, type SceneRequest } from './scene'
import { ROLE_HEIGHT, ROLE_WIDTH, SCENE_ACTIONS_SET, actionFor, fitHeight, sceneFromRef, sceneRef } from './sceneCheck'
import { validateKit } from './validate'
import { aiOff } from './aiLimit'

/** claude — собрала Haiku; library — главный предмет и место нашлись в библиотеке, ИИ не нужен; cache; fallback. */
export type SceneSource = 'claude' | 'library' | 'cache' | 'fallback'

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

// ---------- библиотека без ИИ ----------

/** Объёмный предмет библиотеки по имени или id (только с фигурами). */
const byName = (s: string | null | undefined): KitModel | undefined => {
  if (!s) return undefined
  const direct = sceneRef(s)
  if (direct) return direct
  const m = findByName(s)
  // составное имя («кленовый лист», «кружка с паром») — по словам внутри: первый объёмный предмет
  const inWords = () => findInText(s).map((h) => sceneRef(h.id)).find((x): x is KitModel => !!x)
  return (m ? sceneRef(m.id) : undefined) ?? made.get(madeKey(s)) ?? inWords()
}

// ---------- дорисованные предметы: принятые проверкой глазами, второй раз — мгновенно ----------

/** Предметы, которые нарисовал мастер и приняла проверка глазами (IndexedDB у пользователя, грузится при старте). */
const made = new Map<string, KitModel>()
const madeKey = (s: string) => normQuote(s)
let madeLoaded: Promise<void> | null = null

/** Загрузить дорисованные предметы из IndexedDB в память (один раз). */
export function loadMadeModels(): Promise<void> {
  madeLoaded ??= (async () => {
    const p = db()
    if (!p) return
    try {
      const d = await p
      const all = await new Promise<{ key: string; model: KitModel }[]>((resolve, reject) => {
        const r = d.transaction(MADE).objectStore(MADE).getAll()
        r.onsuccess = () => resolve((r.result ?? []) as { key: string; model: KitModel }[])
        r.onerror = () => reject(r.error)
      })
      for (const x of all) if (x?.model?.parts?.length) made.set(x.key, x.model)
    } catch {
      /* кэш — не обязательный */
    }
  })()
  return madeLoaded
}

/** Запомнить дорисованные предметы сценки (у них есть model — значит, мастер их принял). */
async function rememberMade(scene: KitScene): Promise<void> {
  const fresh = scene.objects.filter((o) => o.model?.parts.length && !made.has(madeKey(o.ru)))
  if (!fresh.length) return
  for (const o of fresh) made.set(madeKey(o.ru), { ...o.model!, ru: o.ru })
  const p = db()
  if (!p) return
  try {
    const d = await p
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(MADE, 'readwrite')
      for (const o of fresh) tx.objectStore(MADE).put({ key: madeKey(o.ru), model: { ...o.model!, ru: o.ru }, createdAt: Date.now() })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* кэш — не обязательный */
  }
}

/** Места словами дневника → стенд библиотеки (самый узнаваемый признак места). */
const PLACE_REF: [RegExp, string][] = [
  [/коф|кафе|кофейн|ресторан|столов/, 'cafe_counter'],
  [/останов/, 'bus_stop'],
  [/пар[аеуы]$|универ|аудитор|лекци|институт|колледж/, 'school_desk'],
  [/школ|класс|урок/, 'school_board'],
  [/кухн/, 'kitchen_table'],
  [/парк|сквер|аллея/, 'bench'],
  [/двор/, 'bench_small'],
  [/подъезд/, 'entrance_door'],
  [/рын|базар|ларёк|ларек/, 'market_stall'],
  [/юрт|аул/, 'yurt'],
  [/гор[аыу]?$|горах|алатау/, 'alatau'],
  [/улиц|проспект/, 'lamp_post'],
  [/офис|работ/, 'work_desk'],
  [/спортзал|стадион|площадк|поле/, 'football_goal'],
  [/озер|река|реке|море|пляж/, 'boat'],
  [/лес/, 'fir'],
  [/окн|подоконник/, 'window_sill'],
  [/комнат|гостин|общаг|дома?$/, 'sofa'],
  [/спальн|кроват/, 'bed'],
  [/библиотек/, 'book_stack'],
  [/костр|поход|лагер/, 'bonfire'],
  [/праздник|день рожд/, 'balloon_bunch'],
]

/** Стенд для места: по имени в библиотеке, иначе по словарю мест. */
export function placeRef(place: string | null | undefined): KitModel | undefined {
  if (!place) return undefined
  const m = byName(place)
  if (m) return m
  const p = place.toLowerCase().replace(/ё/g, 'е')
  for (const w of p.split(/[^\p{L}]+/u)) {
    const hit = PLACE_REF.find(([re]) => re.test(w))
    if (hit) return sceneRef(hit[1])
  }
  return undefined
}

/** Предмет сценки: из библиотеки — ссылкой (ref), дорисованный раньше — фигурами (model). */
const objOf = (m: KitModel, role: SceneObject['role'], ru: string, side: SceneObject['side']): SceneObject =>
  sceneRef(m.id) ? { role, ru, ref: m.id, side } : { role, ru, model: m, side }

/**
 * Сценка «главный предмет + место» прямо из библиотеки, без ИИ (план 13 § 2).
 * null — главного предмета (или названного места) в библиотеке нет: нужен сценограф.
 */
export function libraryScene(req: SceneRequest): KitScene | null {
  // со снимком: вещь в руках и место — ссылками карточки (их Haiku уже перевела в 3D-библиотеку)
  const card = req.photo_card
  const cardThing = card?.things.map((t) => (t.ref ? sceneRef(t.ref) : undefined)).find((m): m is KitModel => !!m && (m.scene ?? (m.hold === 'ground' ? 'stand' : 'hand')) === 'hand')
  const cardPlace = card?.place.ref ? sceneRef(card.place.ref) : undefined
  const hand = byName(req.hero_prop) ?? cardThing ?? (req.hero_prop ? undefined : byName(req.hint))
  if (!hand) return null
  const stand = cardPlace ?? (req.place ? placeRef(req.place) : undefined)
  if (req.place && !stand) return null
  // главный предмет — мебель или постройка (парта, столик, юрта), а другого места нет (или место — он сам):
  // он и есть место, сбоку
  if ((!stand || stand.id === hand.id) && (hand.scene ?? (hand.hold === 'ground' ? 'stand' : 'hand')) === 'stand') {
    return { quote: req.quote, action: actionFor(hand, 'stand'), objects: [objOf(hand, 'stand', req.hero_prop || hand.ru, 'left')], by: 'claude' }
  }
  const objects: SceneObject[] = [objOf(hand, 'hand', req.hero_prop || hand.ru, 'front')]
  if (stand && stand.id !== hand.id) objects.push(objOf(stand, 'stand', req.place || stand.ru, 'left'))
  return { quote: req.quote, action: actionFor(hand, 'hand'), objects, by: 'claude' }
}

// ---------- запасной вариант без сети ----------

/**
 * Сценка из библиотеки, когда точного предмета нет: главный предмет — по имени, по словам цитаты или подсказке
 * (в руки), место — по словарю мест (сбоку). Ничего не нашлось — кристалл в руках. Деталей нет.
 */
export function fallbackScene(req: SceneRequest): KitScene {
  const exact = libraryScene(req)
  if (exact) return { ...exact, by: 'fallback' }
  const cands: KitModel[] = []
  const add = (m: KitModel | null | undefined) => {
    if (m && m.parts.length && !cands.some((x) => x.id === m.id)) cands.push(m)
  }
  add(byName(req.hero_prop))
  for (const h of findInText(`${req.hero_prop ?? ''} ${req.quote}`)) add(sceneRef(h.id))
  add(byName(req.hint))
  const stand = placeRef(req.place)
  // в руки — то, что берут в руки; иначе первое найденное; ничего — кристалл
  const lib = cands.filter((m) => !!sceneRef(m.id))
  const hand = lib.find((m) => m.id !== stand?.id && (m.scene ?? (m.hold === 'ground' ? 'stand' : 'hand')) === 'hand') ?? lib.find((m) => m.id !== stand?.id) ?? sceneRef('crystal')
  if (!hand) return { quote: req.quote, action: 'idle', objects: [], by: 'fallback' }
  const scene = sceneFromRef(req.quote, hand)
  // большой предмет из слов (дерево, автобус) без руки — это место сбоку
  if (scene.objects[0].role === 'stand') scene.objects[0].side = 'left'
  if (stand && stand.id !== hand.id && !scene.objects.some((o) => o.role === 'stand')) scene.objects.push({ role: 'stand', ru: req.place || stand.ru, ref: stand.id, side: 'left' })
  return scene
}

// ---------- кэш в IndexedDB ----------

const DB = 'memory-book-scene'
const STORE = 'scenes'
/** Дорисованные мастером предметы (по названию). */
const MADE = 'made'
let dbp: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === 'undefined') return null
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'key' })
      if (!d.objectStoreNames.contains(MADE)) d.createObjectStore(MADE, { keyPath: 'key' })
    }
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
  madeLoaded = null
  if (!dbp) return
  try {
    ;(await dbp).close()
  } finally {
    dbp = null
  }
}

// ---------- запросы дня ----------

/**
 * Запросы сценок для всех битов фильма (план 13): цитата, текст дня и поля бита из Timeline.beats.
 * Бит-эффект (погода без предмета) тоже получает сценку: его главный предмет — вещь (зонт, снежинка).
 */
export function sceneRequests(timeline: Pick<Timeline, 'events' | 'beats'>, dayText: string): SceneRequest[] {
  const text = dayText.trim()
  const hintOf = new Map<number, string>()
  for (const e of timeline.events) {
    if (e.type !== 'word_transform') continue
    const r = e.result as { id?: string; name?: string }
    hintOf.set(e.beat, r.name ?? r.id ?? '')
  }
  // бит-чувство (эмоция без снимка) сценки не просит: предмета нет, человечек играет эмоцию
  return (timeline.beats ?? []).filter((w) => !(w.kind === 'feeling' && w.emotion && w.photo === null)).map((w, i) => ({
    quote: w.quote,
    // длинная запись (до 3000 знаков) — окно вокруг цитаты бита
    day: dayAround(text, w.quote),
    ...(hintOf.get(w.beat) ? { hint: hintOf.get(w.beat) } : {}),
    hero_prop: w.hero_prop,
    place: w.place,
    companion: w.companion,
    // бит со снимком: сценка по карточке снимка
    ...(w.photo_card ? { photo_card: w.photo_card } : {}),
    // первый бит — быстрый путь: только библиотека
    ...(i === 0 ? { fast: true } : {}),
  }))
}

// ---------- главное ----------

/** Сценка для бита. Кэш → сервер → запасной вариант. Не бросает. */
export async function makeScene(req: SceneRequest, opts: MakeSceneOptions = {}): Promise<SceneResult> {
  const quote = (req.quote ?? '').trim()
  const day = (req.day ?? '').slice(0, SCENE_DAY_MAX + 2)
  const done = (r: SceneResult): SceneResult => {
    rememberScene(r.scene)
    return r
  }
  try {
    if (!quote) return done({ scene: fallbackScene({ quote, day }), source: 'fallback', reason: 'пустая цитата' })
    await loadMadeModels()
    // главный предмет и место есть в библиотеке (или уже дорисованы раньше) — сценка готова сразу, ИИ не нужен
    const lib = libraryScene({ ...req, quote })
    if (lib) return done({ scene: lib, source: 'library' })
    const key = sceneKey({ quote, day })
    const cached = await cacheGet(key, quote)
    if (cached) return done({ scene: cached, source: 'cache' })
    // первый бит: только библиотека — сценка нужна через ~5 с, хвост ИИ бывает до 8 с
    if (req.fast) return done({ scene: fallbackScene({ ...req, quote, day }), source: 'fallback', reason: 'первый бит — только библиотека' })
    // без сети или лимит дней с ИИ исчерпан (src/kit/aiLimit) — сценка из библиотеки
    if (opts.offline || aiOff() || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return done({ scene: fallbackScene({ ...req, quote, day }), source: 'fallback', reason: 'нет сети' })
    }
    const f = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null)
    if (!f) return done({ scene: fallbackScene({ ...req, quote, day }), source: 'fallback', reason: 'нет fetch' })
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? 16500)
    try {
      const res = await f(opts.endpoint ?? '/api/scene', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          quote,
          day,
          ...(req.hint ? { hint: req.hint } : {}),
          ...(req.hero_prop ? { hero_prop: req.hero_prop } : {}),
          ...(req.place ? { place: req.place } : {}),
          ...(req.companion ? { companion: req.companion } : {}),
          ...(req.photo_card ? { photo_card: req.photo_card } : {}),
        }),
        signal: ac.signal,
      })
      if (!res.ok) return done({ scene: fallbackScene({ ...req, quote, day }), source: 'fallback', reason: `сервер ${res.status}` })
      const scene = sanitizeScene(await res.json(), quote)
      if (!scene) return done({ scene: fallbackScene({ ...req, quote, day }), source: 'fallback', reason: 'пустая сценка' })
      void cachePut(key, scene)
      void rememberMade(scene)
      return done({ scene, source: 'claude' })
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    return done({ scene: fallbackScene({ ...req, quote, day }), source: 'fallback', reason: e instanceof Error ? e.name : 'ошибка' })
  }
}
