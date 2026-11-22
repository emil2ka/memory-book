// Мастер моделей (план 13 ③): рисует недостающий предмет в формате кита и сам проверяет его «глазами».
//   1. замысел (одна строка: 1–2 главные черты силуэта, ракурс, 3–4 цвета, контрастные к бежевой бумаге) + фигуры 10–24;
//   2. код: validateKit, меньше 8 фигур — отказ и повтор;
//   3. код рисует предмет как в фильме (src/kit/sceneRender.ts: рядом с человечком, пиксели, ~100 px) → Haiku: «что это?»;
//   4. совпало — принят; нет — второй заход с подсказкой («похоже на лампу, а нужен самокат…»);
//   5. снова нет — ближайший предмет библиотеки или кристалл. Принятое — в кэш (память сервера).
// Общий для /api/scene (сценограф заказывает) и eval/make-batch.ts (пачки для библиотеки).
// Модель — только claude-haiku-5-5. Файл с «_» — не отдельная функция Vercel.
import type { KitModel, Part } from '../src/kit/format'
import { findInText, makeKey, similar } from '../src/kit/library'
import { MIN_MODEL_PARTS, ROLE_HEIGHT, ROLE_WIDTH, fitHeight, sceneRef } from '../src/kit/sceneCheck'
import { renderLook } from '../src/kit/sceneRender'
import { COLOR_NAMES, FX_KINDS, HOLDS, SHAPES, validateKit } from '../src/kit/validate'
import { askJson, couldBe, sameThing, whatIsIt } from './_look'
import { SCENE_LIBRARY } from '../src/kit/sceneCheck'

export interface ModelInput {
  /** Что нарисовать, по-русски, именительный падеж: «самокат». */
  name: string
  /** Замысел или подсказка (от режиссёра или сценографа). */
  hint?: string
  role: 'hand' | 'stand'
  tags?: string[]
}

export interface ModelTry {
  idea: string
  parts: number
  /** Что увидела Haiku на рисунке. */
  seen: string
  ok: boolean
  errors?: string[]
}

export interface ModelRun {
  model: KitModel
  /** Принят проверкой глазами. false — вместо него ближайший из библиотеки или кристалл. */
  accepted: boolean
  source: 'drawn' | 'cache' | 'library' | 'crystal'
  tries: ModelTry[]
  ms: number
  /** PNG рисунка, который проверяли (последняя попытка), base64 — для листов пачек. */
  look?: string
  /** Последний рисунок, не прошедший проверку глазами (целиком) — чтобы человек мог принять его сам. */
  rejected?: KitModel
}

const SYSTEM = `Ты — мастер игрушечных объёмных предметов для пиксельного мультфильма-дневника. Человечек ростом 34 единицы стоит на бумаге книги; предмет должен узнаваться с первого взгляда на картинке ~100 пикселей.

Сначала idea — замысел одной строкой: 1–2 главные черты силуэта, по которым предмет узнают (у самоката — длинная дека, высокий руль, два чёрных колеса; у лампы — гнутая ножка и колпак), ракурс и 3–4 цвета, контрастные к бежевой бумаге (бежевое, кремовое и светло-коричневое на бумаге теряется — бери насыщенные и тёмные). Потом parts.

Как рисовать:
- только крупные простые формы, главная черта преувеличена, игрушечные пухлые пропорции;
- 10–24 фигуры (меньше 8 — не узнать), 3–4 цвета, детали — тёмным или светлым оттенком той же семьи;
- ничего тоньше 1.5 единицы: ручки, ножки, нитки — толще, чем в жизни;
- предмет смотрит на +Z (в камеру), основание на y = 0; людей не рисуй.
Фигура:
- s: ${SHAPES.join(' | ')} (cyl — цилиндр по Y; sph — шар/эллипсоид; cone — конус вершиной вверх, k:4 — пирамида; cap — капсула по Y; torus — кольцо в плоскости XY, как ручка кружки; wedge — клин; prism — призма-крыша, конёк вдоль Z);
- p: [x, y, z] центр, Y вверх; d: [ширина, высота, глубина]; r: [x, y, z] поворот в градусах (только если нужен);
- c: цвет из палитры: ${COLOR_NAMES.join(', ')};
- k: число граней 3–24 (только если нужно); glow: true — светится (экран, огонь, лампа).`

const PART_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['s', 'p', 'd', 'c'],
  properties: {
    s: { type: 'string', enum: [...SHAPES] },
    p: { type: 'array', items: { type: 'number' } },
    d: { type: 'array', items: { type: 'number' } },
    r: { type: 'array', items: { type: 'number' } },
    c: { type: 'string', enum: [...COLOR_NAMES] },
    k: { type: 'integer' },
    glow: { type: 'boolean' },
  },
} as const

const MODEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['idea', 'en', 'hold', 'parts', 'fx'],
  properties: {
    idea: { type: 'string', description: 'замысел: главные черты силуэта, ракурс, цвета — до 20 слов' },
    en: { type: 'string', description: '1–2 слова по-английски' },
    hold: { type: 'string', enum: [...HOLDS] },
    parts: { type: 'array', items: PART_SCHEMA },
    fx: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { type: 'string', enum: [...FX_KINDS] } } } },
  },
} as const

/** Образцы: 3 объёмных предмета библиотеки, похожих по тегам или словам. */
function exemplars(input: ModelInput): KitModel[] {
  const tags = new Set<string>(input.tags ?? [])
  for (const h of findInText(`${input.name} ${input.hint ?? ''}`)) sceneRef(h.id)?.tags.forEach((t) => tags.add(t))
  const pool = similar(tags.size ? [...tags] : ['home', 'city'], 24, { hold: input.role === 'stand' ? 'ground' : 'hand' }).filter((m) => m.parts.length >= 8 && m.parts.length <= 28)
  const out = pool.slice(0, 3)
  for (const id of input.role === 'stand' ? ['bus_stop', 'yurt', 'bench'] : ['cocoa', 'dombra', 'umbrella']) {
    if (out.length >= 3) break
    const m = sceneRef(id)
    if (m && !out.some((x) => x.id === id)) out.push(m)
  }
  return out
}

/** Латиница для id дорисованного предмета: «настольная лампа» → nastolnaya_lampa. */
const TR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i' }
export const translit = (s: string) =>
  [...s.toLowerCase()]
    .map((c) => TR[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const cache = new Map<string, KitModel>()
const cacheKey = (i: ModelInput) => `${makeKey(i.name)}|${i.role}`

const LIB_LIST = SCENE_LIBRARY.map((m) => `${m.id} — ${m.ru}`).join('\n')
const NEAREST_SCHEMA = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: { type: 'string', enum: ['', ...SCENE_LIBRARY.map((m) => m.id)] } } } as const

/**
 * Ближайший объёмный предмет библиотеки: по словам названия, по тегам, иначе — коротким вопросом Haiku
 * «что из библиотеки ближе всего по смыслу» (если есть время). null — ничего похожего.
 */
async function nearest(input: ModelInput, deadline: number, signal?: AbortSignal): Promise<KitModel | null> {
  for (const h of findInText(`${input.name} ${input.hint ?? ''}`)) {
    const m = sceneRef(h.id)
    if (m) return m
  }
  if (input.tags?.length) {
    const m = similar(input.tags, 6, { hold: input.role === 'stand' ? 'ground' : 'hand' }).find((x) => x.parts.length > 0)
    if (m) return m
  }
  if (Date.now() > deadline - 1200) return null
  try {
    const r = await askJson<{ id: string }>(
      [{ type: 'text', text: `Нужен предмет «${input.name}»${input.hint ? ` (${input.hint})` : ''}${input.role === 'stand' ? ' — как место' : ' — в руки человечку'}. Какой предмет из библиотеки зритель примет за него или за очень близкую вещь (капучино → кофе, пирожки → самса, электричка → поезд)? Если замена собьёт с толку (варежки → тюбетейка) или похожего нет — "".\n\n${LIB_LIST}` }],
      'Ты подбираешь замену из библиотеки игрушечных предметов. Отвечай только JSON.',
      NEAREST_SCHEMA as unknown as Record<string, unknown>,
      40,
      signal,
    )
    return r.id ? sceneRef(r.id) ?? null : null
  } catch {
    return null
  }
}

/** Нарисовать и проверить. Не бросает: в худшем случае — ближайший из библиотеки или кристалл. */
export async function runModel(input: ModelInput, opts: { signal?: AbortSignal; deadlineMs?: number; maxLooks?: number } = {}): Promise<ModelRun> {
  const t0 = Date.now()
  const deadline = t0 + (opts.deadlineMs ?? 11_000)
  const name = input.name.trim().slice(0, 60)
  const hit = cache.get(cacheKey(input))
  if (hit) return { model: hit, accepted: true, source: 'cache', tries: [], ms: 0 }
  const tries: ModelTry[] = []
  const ex = exemplars(input)
  const [lo, hi] = ROLE_HEIGHT[input.role]
  let feedback = ''
  let look: string | undefined
  let rejected: KitModel | undefined
  // заходов с проверкой глазами: 2 в фильме (время), в пачках — больше (opts.maxLooks)
  const maxLooks = opts.maxLooks ?? 2
  for (let attempt = 1; attempt <= maxLooks + 1 && tries.filter((t) => t.seen).length < maxLooks; attempt++) {
    if (Date.now() > deadline - 2500) break
    let raw: { idea: string; en: string; hold: string; parts: Part[]; fx: { kind: string }[] }
    try {
      raw = await askJson(
        [
          {
            type: 'text',
            text: [
              'Образцы в формате кита:',
              ...ex.map((m) => JSON.stringify({ ru: m.ru, hold: m.hold, parts: m.parts })),
              '',
              `Нарисуй: «${name}»${input.hint ? ` — ${input.hint}` : ''}.`,
              input.role === 'hand' ? 'Его держат в руках: компактный, но крупные черты.' : 'Это место — стенд рядом с человечком, высота 30–45 единиц.',
              feedback,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
        SYSTEM,
        MODEL_SCHEMA as unknown as Record<string, unknown>,
        6000,
        opts.signal,
      )
    } catch {
      break
    }
    const id = `mk_${translit(name).slice(0, 24) || 'thing'}`
    // k меньше 3, нулевой поворот и glow:false модель шлёт «по умолчанию» — убираем
    const parts = (Array.isArray(raw.parts) ? raw.parts : []).map((q) => {
      const o: Record<string, unknown> = { ...q }
      if (typeof o.k === 'number' && o.k < 3) delete o.k
      if (Array.isArray(o.r) && (o.r as number[]).every((x) => x === 0)) delete o.r
      if (o.glow === false) delete o.glow
      return o
    })
    const check = validateKit({ id, ru: name, stems: [name.toLowerCase().slice(0, 12)], tags: input.tags?.length ? input.tags : ['made'], hold: raw.hold, parts, fx: raw.fx }, { fit: true, heightSlack: 1e3 })
    const n = check.model?.parts.length ?? 0
    if (!check.ok || !check.model || n < Math.max(8, MIN_MODEL_PARTS[input.role])) {
      const errors = check.ok ? [`всего ${n} фигур — нужно 10–24`] : check.errors.slice(0, 5)
      tries.push({ idea: raw.idea ?? '', parts: n, seen: '', ok: false, errors })
      feedback = `Прошлый вариант не прошёл проверку: ${errors.join('; ')}. Исправь.`
      continue
    }
    const model: KitModel = { ...check.model, parts: fitHeight(check.model.parts, lo, hi, ROLE_WIDTH[input.role]), by: 'claude' }
    // проверка глазами: рисунок как в фильме → «что это?»
    const png = renderLook(model, { role: input.role })
    look = png.png.toString('base64')
    let seen = ''
    let ok = false
    try {
      seen = (await whatIsIt(look, input.role, opts.signal)).thing
      // место — упрощённый признак: мягкий вопрос «может ли это быть…»; предмет — строгое совпадение
      ok = input.role === 'stand' ? (await couldBe(name, seen, opts.signal)).match : (await sameThing(name, seen, 'предмет', opts.signal)).match
    } catch {
      // проверка не ответила — не принимаем вслепую
    }
    tries.push({ idea: raw.idea ?? '', parts: model.parts.length, seen, ok })
    if (!ok) rejected = model
    if (ok) {
      cache.set(cacheKey(input), model)
      return { model, accepted: true, source: 'drawn', tries, ms: Date.now() - t0, look }
    }
    feedback = `Проверка глазами: на картинке это похоже на «${seen || 'непонятное'}», а нужен «${name}». Перерисуй: преувеличь главную черту силуэта${input.role === 'hand' ? ', крупнее и проще' : ''}, цвета насыщеннее и контрастнее к бежевой бумаге.`
  }
  // не узнали — ближайший по смыслу из библиотеки (лучше, чем кристалл), иначе кристалл
  const near = await nearest(input, deadline, opts.signal)
  if (near) return { model: near, accepted: false, source: 'library', tries, ms: Date.now() - t0, look, rejected }
  return { model: sceneRef('crystal')!, accepted: false, source: 'crystal', tries, ms: Date.now() - t0, look, rejected }
}
