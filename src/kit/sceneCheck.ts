// Проверка сценки (контракт src/kit/scene.ts): то, что прислала Haiku, превращается в KitScene или в список ошибок.
// - ref: предмет библиотеки кита, у которого есть фигуры (3D);
// - model: дорисованный предмет; проходит validateKit({ fit }) и масштабируется под высоту роли;
// - не больше одного hand, 1–3 предмета, action из списка поз.
// Общий для сервера (api/scene.ts), клиента (запасной вариант) и тестов.
import type { KitModel, Part, Vec3 } from './format'
import { KIT_LIBRARY } from './library'
import { SCENE_ACTIONS, type KitScene, type SceneAction, type SceneObject, type SceneRole, type SceneSide } from './scene'
import { modelBounds, validateKit } from './validate'

export const SCENE_ROLES: readonly SceneRole[] = ['hand', 'stand', 'detail']
export const SCENE_SIDES: readonly SceneSide[] = ['back', 'left', 'right', 'front']
export const SCENE_ACTIONS_SET: ReadonlySet<string> = new Set(SCENE_ACTIONS)

/** Высота предмета по роли, единицы кита (контракт scene.ts). */
/** Меньше фигур — дорисованный предмет не узнать (самокат из 5 коробок). Маленькой детали на земле хватает 4. */
export const MIN_MODEL_PARTS: Record<SceneRole, number> = { stand: 7, hand: 6, detail: 4 }

export const ROLE_HEIGHT: Record<SceneRole, [number, number]> = { hand: [6, 12], stand: [25, 60], detail: [6, 20] }

/** Предметы библиотеки, годные для сценки: только объёмные (с фигурами). */
export const SCENE_LIBRARY: readonly KitModel[] = KIT_LIBRARY.filter((m) => m.parts.length > 0)
export const SCENE_REF_IDS: readonly string[] = SCENE_LIBRARY.map((m) => m.id)
const SCENE_BY_ID = new Map(SCENE_LIBRARY.map((m) => [m.id, m]))
/**
 * Объёмный предмет библиотеки по id. Не kitById: у некоторых id (sofa, bed, balloon) есть двойник-картинка
 * без фигур, и общий поиск отдаёт её.
 */
export const sceneRef = (id: string): KitModel | undefined => SCENE_BY_ID.get(id)

const half = (x: number) => Math.round(x * 2) / 2

/** Наибольшая ширина (X или Z) по роли: плоский лист, растянутый до высоты роли, не должен стать плитой. */
export const ROLE_WIDTH: Record<SceneRole, number> = { hand: 16, stand: 50, detail: 24 }

/**
 * Равномерно масштабировать фигуры так, чтобы высота попала в [lo, hi], а ширина не превысила maxW
 * (ширина важнее: плоский предмет лучше ниже нормы, чем огромной плитой). Основание остаётся на y = 0.
 */
export function fitHeight(parts: Part[], lo: number, hi: number, maxW = Infinity): Part[] {
  const b = modelBounds(parts)
  const h = b.max[1] - b.min[1]
  const w = Math.max(b.size[0], b.size[2])
  let k = h <= 0 || (h >= lo && h <= hi) ? 1 : (h < lo ? lo : hi) / h
  if (w * k > maxW) k = maxW / w
  if (k === 1) return parts
  const out = parts.map((p) => ({ ...p, p: p.p.map((x) => half(x * k)) as Vec3, d: p.d.map((x) => Math.max(0.5, half(x * k))) as Vec3 }))
  const nb = modelBounds(out)
  if (nb.min[1] !== 0) for (const p of out) p.p[1] = half(p.p[1] - nb.min[1])
  return out
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24)

/** Латинский id для дорисованного предмета: из en, иначе транслитом нет — просто номер. */
function madeId(en: string, i: number): string {
  const s = slug(en)
  return `sc_${s && /^[a-z]/.test(s) ? s : 'thing'}_${i}`
}

export interface RawSceneObject {
  role?: unknown
  ru?: unknown
  en?: unknown
  side?: unknown
  ref?: unknown
  look?: unknown
  parts?: unknown
  fx?: unknown
}

export interface SceneCheck {
  scene: KitScene | null
  errors: string[]
  /** сколько предметов из библиотеки и сколько дорисовано */
  refs: number
  models: number
}

/**
 * Проверить ответ модели. Ошибки — понятным языком, их можно отдать модели на повтор.
 * Предмет с ошибкой выбрасывается, но сценка годна, пока остаётся хотя бы один предмет.
 */
export function checkScene(raw: unknown, quote: string): SceneCheck {
  const errors: string[] = []
  const o = (raw && typeof raw === 'object' ? raw : {}) as { action?: unknown; objects?: unknown }
  let action: SceneAction = SCENE_ACTIONS.includes(o.action as SceneAction) ? (o.action as SceneAction) : 'idle'
  if (!SCENE_ACTIONS.includes(o.action as SceneAction)) errors.push(`action: «${String(o.action)}» не из списка ${SCENE_ACTIONS.join(', ')}`)
  const list = Array.isArray(o.objects) ? (o.objects as RawSceneObject[]) : []
  if (!list.length) errors.push('objects: нужен хотя бы один предмет')
  if (list.length > 3) errors.push(`objects: ${list.length} предметов, оставлены первые 3`)
  const objects: SceneObject[] = []
  let refs = 0
  let models = 0
  let hasHand = false
  list.slice(0, 3).forEach((r, i) => {
    let role: SceneRole = SCENE_ROLES.includes(r.role as SceneRole) ? (r.role as SceneRole) : 'detail'
    if (role === 'hand' && hasHand) {
      errors.push(`objects[${i}]: второй hand — стал detail (в руке только один предмет)`)
      role = 'detail'
    }
    const ru = typeof r.ru === 'string' && r.ru.trim() ? r.ru.trim().slice(0, 40) : 'предмет'
    const side: SceneSide = SCENE_SIDES.includes(r.side as SceneSide) ? (r.side as SceneSide) : role === 'stand' ? 'back' : role === 'hand' ? 'front' : 'right'
    const refId = typeof r.ref === 'string' ? r.ref.trim() : ''
    const lib = refId ? sceneRef(refId) : undefined
    if (lib && lib.parts.length) {
      objects.push({ role, ru, ref: lib.id, side })
      refs++
      if (role === 'hand') hasHand = true
      return
    }
    if (refId) errors.push(`objects[${i}].ref: «${refId}» нет в объёмной библиотеке — нарисуй model или выбери другой id`)
    const parts = Array.isArray(r.parts) ? r.parts : []
    if (!parts.length) {
      if (!refId) errors.push(`objects[${i}] «${ru}»: нет ни ref, ни фигур`)
      return
    }
    // k меньше 3 и нулевой поворот модель иногда шлёт как «по умолчанию» — убираем, а не зажимаем до треугольника
    for (const q of parts as Record<string, unknown>[]) {
      if (q && typeof q === 'object') {
        if (typeof q.k === 'number' && q.k < 3) delete q.k
        if (Array.isArray(q.r) && q.r.every((x) => x === 0)) delete q.r
        if (q.glow === false) delete q.glow
      }
    }
    const hold: KitModel['hold'] = role === 'hand' ? (action === 'carry' ? 'both' : 'hand') : role === 'stand' ? 'ground' : 'both'
    const id = madeId(typeof r.en === 'string' ? r.en : '', i)
    // высоту под роль подгоняет fitHeight (с пределом ширины), validateKit только чинит фигуры и ставит на землю
    const check = validateKit({ id, ru, stems: [ru.toLowerCase().slice(0, 12)], tags: ['scene'], hold, parts, fx: r.fx }, { fit: true, heightSlack: 1e3 })
    if (!check.ok || !check.model) {
      errors.push(...check.errors.slice(0, 4).map((e) => `objects[${i}] «${ru}»: ${e}`))
      return
    }
    const [lo, hi] = ROLE_HEIGHT[role]
    const model: KitModel = { ...check.model, parts: fitHeight(check.model.parts, lo, hi, ROLE_WIDTH[role]), by: 'claude' }
    // слишком простой предмет не узнать в пикселях: просим повтор, но сам предмет оставляем — вдруг на повтор не хватит времени
    if (model.parts.length < MIN_MODEL_PARTS[role]) errors.push(`objects[${i}] «${ru}»: всего ${model.parts.length} фигур — нужно ${MIN_MODEL_PARTS[role]}–24, главная черта крупно`)
    objects.push({ role, ru, model, side })
    models++
    if (role === 'hand') hasHand = true
  })
  // поза без предмета в руке: «пьёт» и «несёт» не из чего — стоит
  if ((action === 'drink' || action === 'carry' || action === 'shake') && !hasHand) action = 'idle'
  // предмет в руке есть, а он просто стоит — берём позу по предмету
  const hand = objects.find((o) => o.role === 'hand')
  if (hand && action === 'idle') {
    const m = hand.ref ? sceneRef(hand.ref) : hand.model
    action = m && (m.tags.includes('drink') || m.tags.includes('food')) ? 'drink' : 'carry'
  }
  // высокое и узкое (дерево, фонарь) за спиной торчит над головой, как шапка — ставим сбоку, напротив детали
  for (const o of objects) {
    if (o.role !== 'stand' || (o.side && o.side !== 'back')) continue
    const parts = o.ref ? sceneRef(o.ref)?.parts : o.model?.parts
    if (!parts?.length) continue
    const b = modelBounds(parts)
    if (b.size[1] > 1.35 * Math.max(b.size[0], b.size[2])) {
      const taken = objects.find((x) => x !== o && (x.side === 'left' || x.side === 'right'))?.side
      o.side = taken === 'left' ? 'right' : 'left'
    }
  }
  // стенд: место + что в руках + деталь; меньше — просим дополнить (сценка при этом остаётся годной)
  if (objects.length) {
    if (!hand) errors.push('нет hand: добавь то, что человечек держит (из фразы или уместное месту и времени)')
    if (!objects.some((o) => o.role === 'stand')) errors.push('нет stand: добавь признак места')
    else if (objects.length < 3) errors.push(`предметов ${objects.length}: нужен стенд из трёх — stand + hand + detail`)
  }
  return { scene: objects.length ? { quote, action, objects, by: 'claude' } : null, errors, refs, models }
}

// ---------- запасной вариант без сети ----------

const ACTION_BY_TAG: [string, SceneAction][] = [
  ['drink', 'drink'],
  ['food', 'drink'],
  ['cold', 'shiver'],
  ['winter', 'shiver'],
  ['holiday', 'cheer'],
  ['joy', 'cheer'],
  ['music', 'shake'],
  ['sit', 'sit'],
  ['furniture', 'sit'],
]

/** Поза по тегам предмета и тому, как его держат. */
export function actionFor(m: KitModel | undefined, role: SceneRole): SceneAction {
  if (!m) return 'idle'
  if (role === 'hand' && m.hold === 'both') return 'carry'
  if (/bench|chair|sofa|dastarkhan/.test(m.id)) return 'sit'
  for (const [tag, a] of ACTION_BY_TAG) if (m.tags.includes(tag)) return role === 'hand' || a === 'shiver' || a === 'cheer' || a === 'sit' ? a : 'idle'
  return 'idle'
}

/** Сценка из одного предмета библиотеки: в руки, если его берут, иначе — декорацией за спиной. */
export function sceneFromRef(quote: string, m: KitModel): KitScene {
  const role: SceneRole = m.scene ?? (m.hold === 'ground' ? 'stand' : 'hand')
  return { quote, action: actionFor(m, role), objects: [{ role, ru: m.ru, ref: m.id, side: role === 'stand' ? 'back' : 'front' }], by: 'fallback' }
}
