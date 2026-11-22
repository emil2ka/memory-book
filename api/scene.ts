// Сценка для бита: POST /api/scene, тело { quote, day, hint }, ответ — KitScene (src/kit/scene.ts).
// Haiku — режиссёр маленького стенда вокруг человечка: берёт готовые объёмные предметы библиотеки кита (ref)
// и дорисовывает в формате кита только недостающее (model). Код проверяет (src/kit/sceneCheck.ts):
// ref существует и объёмный, model проходит validateKit({ fit }) под высоту роли; при ошибке — один повтор.
// Модель — только claude-haiku-5-5. Ключ читается здесь и никуда не уходит.
import Anthropic from '@anthropic-ai/sdk'
import type { KitModel } from '../src/kit/format'
import { categoryOf, findInText, kitById, similar } from '../src/kit/library'
import { SCENE_ACTIONS, SCENE_DAY_MAX, type KitScene, type SceneRequest } from '../src/kit/scene'
import { checkScene, ROLE_HEIGHT, SCENE_LIBRARY, SCENE_REF_IDS, SCENE_SIDES, sceneRef } from '../src/kit/sceneCheck'
import { kitSize } from '../src/kit/validate'
import { runModel, type ModelRun } from './_model'
import { photoCardText, sanitizePhotoCard } from '../src/kit/scenePhoto'
import { findByName } from '../src/kit/library'
import { dayLimitReply, overDayLimit, whoFromRequest } from './_dayLimit'

export const config = { maxDuration: 20 }

export const SCENE_MODEL = 'claude-haiku-5-5'
/** Весь бюджет на сценку, включая повтор: сценка нужна к своему биту, запрос уходит сразу после режиссёра. */
export const SCENE_TIMEOUT_MS = 14000

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
  /** Сколько предметов заказано мастеру и сколько из них прошли проверку глазами. */
  ordered?: number
  accepted?: number
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
  const day = typeof b.day === 'string' ? b.day.trim().slice(0, SCENE_DAY_MAX + 2) : ''
  const hint = typeof b.hint === 'string' ? b.hint.trim().slice(0, 120) : ''
  const str = (v: unknown, n = 40) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : '')
  const hero_prop = str(b.hero_prop)
  const place = str(b.place)
  const c = (typeof b.companion === 'object' && b.companion !== null ? b.companion : {}) as Record<string, unknown>
  const companion = str(c.name) || str(c.role) ? { name: str(c.name) || str(c.role), role: str(c.role) || 'друг' } : null
  const photo_card = b.photo_card ? sanitizePhotoCard(b.photo_card) : null
  return { quote, day, ...(hint ? { hint } : {}), ...(hero_prop ? { hero_prop } : {}), ...(place ? { place } : {}), ...(companion ? { companion } : {}), ...(photo_card ? { photo_card } : {}) }
}

// ---------- промпт ----------

const libraryList = SCENE_LIBRARY.map((m) => `${m.id} — ${m.ru} (${m.scene ? `роль ${m.scene}, ` : ''}${m.hold}, высота ${Math.round(kitSize(m)[1])})`).join('\n')

export const SCENE_SYSTEM = `Ты — художник-постановщик крошечных объёмных сценок для дневника-фильма. На странице книги стоит пиксельный человечек ростом 34 единицы (большая голова, шарф). Каждая фраза дня становится ОДНОЙ понятной картинкой, которую зритель узнаёт с первого взгляда: крупный главный предмет у человечка в руках и, если важно, место сбоку.

## Сценка: главный предмет + место
- hand — ГЛАВНЫЙ ПРЕДМЕТ фразы. Режиссёр уже назвал его («Главный предмет фразы») — бери именно его. Из библиотеки (ref), если там есть он или очень близкий по смыслу («кружка с паром» → какао, «капучино» → кофе, «пирожки» → самса); иначе дорисуй. Высота ${ROLE_HEIGHT.hand.join('–')}. Ровно один hand, всегда. Если режиссёр предмет не назвал — возьми вещь из самой фразы.
- stand — МЕСТО, только если режиссёр назвал место («Место»). Самый узнаваемый признак места: кофейня → кассовая стойка кафе или столик кафе, остановка → остановка, пара → парта или школьная доска, кухня → кухонный стол, парк → скамейка в парке или дерево, юрта → юрта, двор → скамейка. Высота ${ROLE_HEIGHT.stand.join('–')}, ширина до 50. Ставь СБОКУ: side left или right, никогда не back. Место не названо — stand нет.
- Больше ничего: никаких деталей, мелочи и людей. Второго человечка (если во фразе человек) сцена ставит сама.
Сценка — про ЭТУ фразу. Запись дня дана только чтобы понять место, время и погоду.

## Позы (action)
Есть hand — поза НЕ idle: drink — ест или пьёт то, что в руке; carry — держит или несёт перед собой двумя руками; shake — машет предметом над головой (лист, флажок, шарик, телефон от радости). Можно и sit (сидит на скамейке с кружкой), cheer (прыгает от радости), shiver (мёрзнет).
idle — только когда hand нет.

## Сначала библиотека
Если подходящий предмет есть в библиотеке ниже (тот же или очень близкий по смыслу) — укажи его id в ref. Библиотечные предметы нарисованы заранее и выглядят лучше. Если подходящего нет — ref "", а в look — замысел для мастера: 1–2 главные черты силуэта и 3–4 цвета, контрастные к бежевой бумаге («самокат: длинная дека, высокий руль, два чёрных колеса; красный, чёрный, серый»). Нарисует мастер и проверит глазами.

## Библиотека (id — название (роль по умолчанию, как держат, высота))
${libraryList}

## Ответ
look — план сценки до 20 слов. action. objects (hand и, если названо место, stand): для каждого role, ru (название по-русски, именительный падеж), en (1–2 слова по-английски), side (${SCENE_SIDES.join(' | ')}), ref (id библиотеки или ""), look (для ref — "", без ref — замысел для мастера).`


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
        required: ['role', 'ru', 'en', 'side', 'ref', 'look'],
        properties: {
          role: { type: 'string', enum: ['hand', 'stand'] },
          ru: { type: 'string' },
          en: { type: 'string' },
          side: { type: 'string', enum: [...SCENE_SIDES] },
          ref: { type: 'string', enum: ['', ...SCENE_REF_IDS] },
          look: { type: 'string' },
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
    // образцы фигур не нужны: сценограф выбирает из библиотеки, рисует мастер (api/_model.ts)
    exemplars.length ? '' : '',
    req.day ? `Запись дня (для контекста): «${req.day}»` : '',
    `Фраза бита: «${req.quote}»`,
    req.hint ? `Подсказка режиссёра: ${req.hint}` : '',
    req.hero_prop ? `Главный предмет фразы (режиссёр): ${req.hero_prop} — он в руках (hand) или прямо перед человечком` : '',
    req.place ? `Место (режиссёр): ${req.place} — это stand` : '',
    req.companion ? `Человек из фразы: ${req.companion.name} (${req.companion.role}) — его играет второй человечек сцены, людей не рисуй` : '',
    req.photo_card ? `К этой фразе есть фото — сценка должна совпасть с ним (место и вещи с фото): ${photoCardText(req.photo_card, 0)}` : '',
    hits.length ? `В библиотеке по словам фразы нашлось: ${hits.map((m) => `${m.id} (${m.ru})`).join(', ')}` : '',
    'Собери сценку.',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Предметы сценки без библиотечного ref — заказ мастеру моделей (api/_model.ts): рисует, проверяет глазами,
 * не вышло — ближайший предмет библиотеки или кристалл. Мутирует raw.objects: ставит parts или ref.
 */
async function orderModels(raw: unknown, req: SceneRequest, deadline: number, signal: AbortSignal, early: Promise<ModelRun> | null): Promise<{ ordered: number; accepted: number; noStand: boolean }> {
  const objs = (raw && typeof raw === 'object' && Array.isArray((raw as { objects?: unknown }).objects) ? (raw as { objects: Record<string, unknown>[] }).objects : []).slice(0, 3)
  let ordered = 0
  let accepted = 0
  let noStand = false
  await Promise.all(
    objs.map(async (o) => {
      if (!o || typeof o !== 'object') return
      const role = o.role === 'stand' ? 'stand' : o.role === 'hand' ? 'hand' : null
      if (!role) return
      const ref = typeof o.ref === 'string' ? o.ref.trim() : ''
      if (ref && sceneRef(ref)?.parts.length) return
      // места на лету не рисуем (дорого, а кристалл вместо места бессмысленен): нет в библиотеке — сценка без места
      if (role === 'stand') {
        o.role = 'detail'
        noStand = true
        return
      }
      const name = (typeof o.ru === 'string' && o.ru.trim()) || (role === 'hand' ? req.hero_prop : req.place) || ''
      if (!name) return
      ordered++
      // главный предмет уже рисуется с начала запроса (параллельно сценографу) — ждём его, а не начинаем заново
      const r = early && role === 'hand' ? await early : await runModel({ name, hint: typeof o.look === 'string' ? o.look : undefined, role }, { deadlineMs: Math.max(3000, deadline - Date.now()), signal })
      if (r.accepted) accepted++
      if (r.source === 'library' || r.source === 'crystal') {
        o.ref = r.model.id
        o.parts = []
      } else {
        o.ref = ''
        o.parts = r.model.parts
        if (r.model.fx) o.fx = r.model.fx
      }
    }),
  )
  return { ordered, accepted, noStand }
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
  let models = 0
  let accepted = 0
  // главного предмета нет в библиотеке — мастер начинает рисовать сразу, параллельно сценографу
  // (сценограф может найти синоним в библиотеке — тогда рисунок не нужен и отменяется)
  const libHand = req.hero_prop ? sceneRef(findByName(req.hero_prop)?.id ?? req.hero_prop) : undefined
  const earlyAc = new AbortController()
  ac.signal.addEventListener('abort', () => earlyAc.abort())
  const early = req.hero_prop && !libHand ? runModel({ name: req.hero_prop, role: 'hand' }, { deadlineMs: timeoutMs - 800, signal: earlyAc.signal }) : null
  let earlyUsed = false
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
      // чего нет в библиотеке — рисует мастер с проверкой глазами (параллельно, в пределах бюджета)
      const ordered = await orderModels(raw, req, t0 + timeoutMs - 600, ac.signal, earlyUsed ? null : early)
      if (ordered.ordered) earlyUsed = true
      models += ordered.ordered
      accepted += ordered.accepted
      // место не нашлось в библиотеке и убрано — не требуем его (иначе лишний повтор)
      const check = checkScene(raw, req.quote, ordered.noStand ? { ...req, place: null } : req)
      if (check.scene) {
        const run: SceneRun = { scene: check.scene, attempts: attempt, firstErrors: attempt === 1 ? check.errors : firstErrors, latencyMs: Date.now() - t0, refs: check.refs, models: check.models, ordered: models, accepted, usage }
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
    if (!earlyUsed) earlyAc.abort()
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
  return list.length > (Number(process.env.SCENE_RATE_LIMIT) || 60)
}

export async function handleScene(body: unknown, ip: string): Promise<{ status: number; json: unknown; headers: Record<string, string> }> {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  try {
    if (rateLimited(ip)) throw new SceneError('rate_limited', 'Слишком много запросов, подождите', 429)
    // человек уже упёрся в лимит дней с ИИ — его сценки, фото, песни и дорисовки тоже без ИИ (api/_dayLimit.ts)
    if (overDayLimit(ip, 'aux')) return dayLimitReply(headers, ip)
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
  // «вошёл» — только по проверенному токену Supabase; иначе гость по IP
  const r = await handleScene(body, await whoFromRequest(ip, request.headers.get('authorization')))
  return new Response(JSON.stringify(r.json), { status: r.status, headers: r.headers })
}

export default { fetch: (request: Request) => (request.method === 'POST' ? POST(request) : new Response('Method Not Allowed', { status: 405 })) }
