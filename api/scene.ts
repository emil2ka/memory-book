// Сценка для бита: POST /api/scene, тело { quote, day, hint }, ответ — KitScene (src/kit/scene.ts).
// Haiku — режиссёр маленького стенда вокруг человечка: берёт готовые объёмные предметы библиотеки кита (ref)
// и дорисовывает в формате кита только недостающее (model). Код проверяет (src/kit/sceneCheck.ts):
// ref существует и объёмный, model проходит validateKit({ fit }) под высоту роли; при ошибке — один повтор.
// Модель — только claude-haiku-5-5. Ключ читается здесь и никуда не уходит.
import Anthropic from '@anthropic-ai/sdk'
import type { KitModel } from '../src/kit/format'
import { categoryOf, findInText, kitById, similar } from '../src/kit/library'
import { SCENE_ACTIONS, type KitScene, type SceneRequest } from '../src/kit/scene'
import { checkScene, ROLE_HEIGHT, SCENE_LIBRARY, SCENE_REF_IDS, SCENE_SIDES, sceneRef } from '../src/kit/sceneCheck'
import { COLOR_NAMES, FX_KINDS, SHAPES, kitSize } from '../src/kit/validate'

export const config = { maxDuration: 15 }

export const SCENE_MODEL = 'claude-haiku-5-5'
/** Весь бюджет на сценку, включая повтор: сценка нужна к своему биту, запрос уходит сразу после режиссёра. */
export const SCENE_TIMEOUT_MS = 12000

export class SceneError extends Error {
  constructor(public code: 'bad_input' | 'refusal' | 'max_tokens' | 'bad_json' | 'invalid' | 'api' | 'no_key' | 'rate_limited' | 'timeout', message: string, public status = 500, public errors: string[] = []) {
    super(message)
  }
}

export interface SceneRun {
  scene: KitScene
  attempts: number
  firstErrors: string[]
  latencyMs: number
  refs: number
  models: number
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number }
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new SceneError('no_key', 'ANTHROPIC_API_KEY не задан', 503)
  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.DIRECTOR_BASE_URL || 'https://api.anthropic.com',
    timeout: 30_000,
    maxRetries: 0,
  })
  return client
}

export function parseSceneInput(body: unknown): SceneRequest {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const quote = typeof b.quote === 'string' ? b.quote.trim().slice(0, 200) : ''
  if (!quote) throw new SceneError('bad_input', 'Пустая цитата', 400)
  const day = typeof b.day === 'string' ? b.day.trim().slice(0, 600) : ''
  const hint = typeof b.hint === 'string' ? b.hint.trim().slice(0, 120) : ''
  return { quote, day, ...(hint ? { hint } : {}) }
}

// ---------- промпт ----------

const libraryList = SCENE_LIBRARY.map((m) => `${m.id} — ${m.ru} (${m.scene ? `роль ${m.scene}, ` : ''}${m.hold}, высота ${Math.round(kitSize(m)[1])})`).join('\n')

export const SCENE_SYSTEM = `Ты — режиссёр крошечных объёмных сценок для дневника-фильма. На странице книги стоит пиксельный человечек ростом 34 единицы (большая голова, шарф). Каждая фраза дня превращается в маленький стенд вокруг него: человечек в подходящей позе, предмет в руках, декорация, которая задаёт МЕСТО, и, если нужно, деталь рядом.

## Стенд: почти всегда три предмета
Сценка — это СТЕНД: человечек держит предмет, за ним или сбоку — место, рядом на земле — деталь. Почти всегда ровно три предмета: stand + hand + detail. Меньше — только если фраза совсем абстрактная («очень тихо», «стало легче»), и даже тогда хотя бы stand + hand.
- stand — самый узнаваемый признак МЕСТА: скамейка, киоск, рабочий стол, окно, юрта, автобус, дерево, фонарь. Высота ${ROLE_HEIGHT.stand.join('–')}, ширина до 50. Деревья, фонари и всё высокое и узкое — СБОКУ (side left или right), иначе крона торчит у человечка над головой, как шапка. Широкое и низкое (скамейка, стол, окно, автобус) — сзади (back).
- hand — то, что человечек держит или с чем взаимодействует. Высота ${ROLE_HEIGHT.hand.join('–')}. Обязателен, если во фразе есть еда, напиток, вещь, инструмент, животное на руках. Если во фразе такого нет — придумай уместное: «по парку» → кленовый лист, «фонари» → фонарик или горячий напиток вечером, «засмеялся» → телефон, «дедлайн» → будильник. Не больше одного hand.
- detail — маленькое, на земле и уместное: урна, лужа, кучка листьев, кот, рюкзак, мяч, снежок. Высота ${ROLE_HEIGHT.detail.join('–')}. side — left, right или front.
Сценка — про ЭТУ фразу, а не про весь день. Запись дня дана только чтобы понять место, время и погоду; не переноси в сценку предметы из других фраз дня (если во фразе нет какао — какао в руках не нужно).

## Позы (action)
Есть hand — поза НЕ idle: drink — ест или пьёт то, что в руке; carry — держит или несёт перед собой двумя руками; shake — машет предметом над головой (лист, флажок, шарик, телефон от радости). Можно и sit (сидит на скамейке с кружкой), cheer (прыгает от радости), shiver (мёрзнет).
idle — только когда hand нет.

## Сначала библиотека
Если подходящий предмет есть в библиотеке ниже — укажи его id в ref и оставь parts пустым. Библиотечные предметы нарисованы заранее и выглядят лучше. Дорисовывай (ref пустой, parts заполнены) только то, чего в библиотеке нет.

## Библиотека (id — название (роль по умолчанию, как держат, высота))
${libraryList}

## Как дорисовать предмет (model)
Сначала поле look: главная черта силуэта и 3–5 цветов, до 12 слов. Потом parts.
Движок рисует всё крупными пикселями со ступенчатым светом и тёмным контуром, поэтому:
- только крупные простые формы, главная черта преувеличена, игрушечные пухлые пропорции;
- 3–5 цветов на предмет, детали — тёмным или светлым оттенком той же семьи;
- ничего тоньше 1 единицы; stand и hand — 8–24 фигуры, маленькая detail — от 4, максимум 40. Меньше 8 — предмет не узнать: у самоката нужны дека, руль, стойка и два колеса, у шариков — 3–4 шара разных цветов с нитками.
- Не рисуй людей: второго человека сцена добавит сама. Человечек и так в центре — предметы только вокруг него.
Фигура:
- s: ${SHAPES.join(' | ')} (cyl — цилиндр по Y; sph — шар/эллипсоид; cone — конус вершиной вверх, k:4 — пирамида; cap — капсула по Y; torus — кольцо в плоскости XY, как ручка кружки; wedge — клин; prism — призма-крыша, конёк вдоль Z);
- p: [x, y, z] центр, Y вверх, y = 0 — бумага, предмет смотрит на +Z (в камеру);
- d: [ширина, высота, глубина];
- r: [x, y, z] поворот в градусах (только если нужен);
- c: цвет — имя из палитры: ${COLOR_NAMES.join(', ')};
- k: число граней 3–24 (только если нужно, например 6 — карандаш); glow: true — светится (экран, огонь, лампа).
fx (необязательно, до 2): ${FX_KINDS.join(', ')}.

## Ответ
look — план сценки до 20 слов. action. objects: для каждого role, ru (название по-русски), en (1–2 слова по-английски), side (${SCENE_SIDES.join(' | ')}), ref (id библиотеки или ""), look (для дорисовки — главная черта, для ref — ""), parts (для ref — пустой массив), fx.`

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

export const SCENE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['look', 'action', 'objects'],
  properties: {
    look: { type: 'string', description: 'план сценки до 20 слов' },
    action: { type: 'string', enum: [...SCENE_ACTIONS] },
    objects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['role', 'ru', 'en', 'side', 'ref', 'look', 'parts', 'fx'],
        properties: {
          role: { type: 'string', enum: ['hand', 'stand', 'detail'] },
          ru: { type: 'string' },
          en: { type: 'string' },
          side: { type: 'string', enum: [...SCENE_SIDES] },
          ref: { type: 'string', enum: ['', ...SCENE_REF_IDS] },
          look: { type: 'string' },
          parts: { type: 'array', items: PART_SCHEMA },
          fx: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { type: 'string', enum: [...FX_KINDS] } } } },
        },
      },
    },
  },
} as const

/** Образцы для дорисовки: 3 объёмных предмета библиотеки, похожих по тегам на слова фразы, + какао как эталон. */
export function pickSceneExemplars(req: SceneRequest, n = 4): KitModel[] {
  const hits = findInText(`${req.quote} ${req.hint ?? ''}`)
    .map((h) => sceneRef(h.id) ?? kitById(h.id))
    .filter((m): m is KitModel => !!m)
  const tags = new Set<string>()
  for (const m of hits) {
    m.tags.forEach((t) => tags.add(t))
    const c = categoryOf(m.id)
    if (c) tags.add(c)
  }
  // то, что уже нашлось по словам, Haiku возьмёт как ref — образцами берём соседей
  const exclude = hits.map((m) => m.id)
  const pool = similar(tags.size ? [...tags] : ['home', 'city'], 24, { exclude }).filter((m) => m.parts.length && m.parts.length <= 32)
  const out: KitModel[] = pool.slice(0, n - 1)
  for (const id of ['cocoa', 'bench', 'tree']) {
    if (out.length >= n) break
    const m = sceneRef(id)
    if (m && !out.some((x) => x.id === id) && !exclude.includes(id)) out.push(m)
  }
  return out.slice(0, n)
}

export function buildSceneUser(req: SceneRequest, exemplars: KitModel[]): string {
  const hits = findInText(req.quote)
    .map((h) => sceneRef(h.id))
    .filter((m): m is KitModel => !!m)
  return [
    'Образцы дорисованных предметов в формате кита:',
    ...exemplars.map((m) => JSON.stringify({ id: m.id, ru: m.ru, hold: m.hold, parts: m.parts })),
    '',
    req.day ? `Запись дня (для контекста): «${req.day}»` : '',
    `Фраза бита: «${req.quote}»`,
    req.hint ? `Подсказка режиссёра: ${req.hint}` : '',
    hits.length ? `В библиотеке по словам фразы нашлось: ${hits.map((m) => `${m.id} (${m.ru})`).join(', ')}` : '',
    'Собери сценку.',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Собрать сценку. Один повтор с ошибками проверки, всё в пределах timeoutMs. */
export async function runScene(req: SceneRequest, opts: { model?: string; effort?: 'low' | 'medium'; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<SceneRun> {
  const model = opts.model ?? process.env.SCENE_MODEL ?? SCENE_MODEL
  const effort = opts.effort ?? ((process.env.SCENE_EFFORT as 'low' | 'medium' | undefined) || 'low')
  const timeoutMs = opts.timeoutMs ?? SCENE_TIMEOUT_MS
  const t0 = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  opts.signal?.addEventListener('abort', () => ac.abort())
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: buildSceneUser(req, pickSceneExemplars(req)) }]
  let firstErrors: string[] = []
  let best: SceneRun | null = null
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let response: Anthropic.Message
      try {
        response = await getClient().messages.create(
          {
            model,
            max_tokens: 8000,
            system: [{ type: 'text', text: SCENE_SYSTEM, cache_control: { type: 'ephemeral' } }],
            messages,
            // без размышлений: сценка — выбор из библиотеки и раскладка фигур по образцам, скорость важнее
            thinking: { type: 'disabled' },
            output_config: { effort, format: { type: 'json_schema', schema: SCENE_SCHEMA as unknown as Record<string, unknown> } },
          },
          { signal: ac.signal },
        )
      } catch (e) {
        if (ac.signal.aborted) {
          if (best) return best
          throw new SceneError('timeout', `Сценка дольше ${timeoutMs} мс`, 504, firstErrors)
        }
        if (e instanceof Anthropic.RateLimitError) throw new SceneError('rate_limited', 'Лимит запросов LLM', 429)
        if (e instanceof Anthropic.APIError) throw new SceneError('api', `LLM ${e.status ?? ''}: ${e.name}`, 502)
        throw new SceneError('api', e instanceof Error ? e.name : 'сеть', 502)
      }
      usage.input += response.usage.input_tokens
      usage.output += response.usage.output_tokens
      usage.cacheRead += response.usage.cache_read_input_tokens ?? 0
      usage.cacheWrite += response.usage.cache_creation_input_tokens ?? 0
      if (response.stop_reason === 'refusal') throw new SceneError('refusal', 'Модель отказалась', 502)
      if (response.stop_reason === 'max_tokens') throw new SceneError('max_tokens', 'Ответ обрезан', 502)
      const text = response.content.find((c): c is Anthropic.TextBlock => c.type === 'text')?.text ?? ''
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        throw new SceneError('bad_json', 'Ответ не JSON', 502)
      }
      const check = checkScene(raw, req.quote)
      if (check.scene) {
        const run: SceneRun = { scene: check.scene, attempts: attempt, firstErrors: attempt === 1 ? check.errors : firstErrors, latencyMs: Date.now() - t0, refs: check.refs, models: check.models, usage }
        // годная сценка, но часть предметов выброшена — повтор, только если есть время; иначе отдаём что есть
        if (!check.errors.length || attempt === 2) return run
        best = run
      }
      if (attempt === 1) {
        firstErrors = check.errors
        if (timeoutMs - (Date.now() - t0) < 4500) break
        messages.push({ role: 'assistant', content: text })
        messages.push({ role: 'user', content: `Проверка не прошла:\n- ${check.errors.slice(0, 12).join('\n- ')}\nИсправь и пришли всю сценку заново.` })
      }
    }
    if (best) return best
    throw new SceneError('invalid', 'Сценка не прошла проверку', 422, firstErrors)
  } finally {
    clearTimeout(timer)
  }
}

// Лимит по IP: 60 сценок за 10 минут на экземпляр функции (день — до 7 битов).
const hits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > 60
}

export async function handleScene(body: unknown, ip: string): Promise<{ status: number; json: unknown; headers: Record<string, string> }> {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  try {
    if (rateLimited(ip)) throw new SceneError('rate_limited', 'Слишком много запросов, подождите', 429)
    const run = await runScene(parseSceneInput(body))
    headers['x-scene-latency'] = String(run.latencyMs)
    headers['x-scene-attempts'] = String(run.attempts)
    return { status: 200, json: run.scene, headers }
  } catch (e) {
    const err = e instanceof SceneError ? e : new SceneError('api', 'Внутренняя ошибка', 500)
    return { status: err.status, json: { error: err.code, message: err.message, errors: err.errors.slice(0, 8) }, headers }
  }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const r = await handleScene(body, ip)
  return new Response(JSON.stringify(r.json), { status: r.status, headers: r.headers })
}

export default { fetch: (request: Request) => (request.method === 'POST' ? POST(request) : new Response('Method Not Allowed', { status: 405 })) }
