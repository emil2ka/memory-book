// Дорисовка предмета: POST /api/make, тело { name, hint, tags }, ответ — KitPicture (by: "claude"):
// поля поиска + SVG-картинка в стиле библиотеки (assets/kit2d). Решение Эмиля от 21 ноября: предметы — 2D-картинки.
// Claude рисует по 5 образцам из библиотеки; код проверяет (validatePicture) и при ошибке просит исправить один раз.
// Модель — только claude-haiku-5-5. Ключ читается здесь и никуда не уходит.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import type { KitModel } from '../src/kit/format'
import { kitById, similar } from '../src/kit/library'
import { PALETTE_HEX, SVG_LIMITS, validatePicture, type KitPicture } from '../src/kit/svg'
import { FX_KINDS, HOLDS } from '../src/kit/validate'

export const config = { maxDuration: 15 }

export const MAKE_MODEL = 'claude-haiku-5-5'
/**
 * Весь бюджет на дорисовку, включая повтор. Предмет нужен сцене только к своему биту (интро 8 с + бит),
 * а дорисовка стартует сразу после ответа режиссёра.
 */
export const MAKE_TIMEOUT_MS = 12000

export interface MakeInput {
  /** Слово из текста или название предмета, по-русски/казахски/английски. */
  name: string
  /** Короткая подсказка режиссёра: как выглядит, что главное. */
  hint: string
  tags: string[]
}

export class MakeError extends Error {
  constructor(public code: 'bad_input' | 'refusal' | 'max_tokens' | 'bad_json' | 'invalid' | 'api' | 'no_key' | 'rate_limited' | 'timeout', message: string, public status = 500, public errors: string[] = []) {
    super(message)
  }
}

export interface MakeRun {
  model: KitPicture
  attempts: number
  /** Ошибки первой попытки, если был повтор. */
  firstErrors: string[]
  latencyMs: number
  usage: { input: number; output: number; cacheRead: number }
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new MakeError('no_key', 'ANTHROPIC_API_KEY не задан', 503)
  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.DIRECTOR_BASE_URL || 'https://api.anthropic.com',
    timeout: 30_000,
    maxRetries: 0,
  })
  return client
}

export function parseMakeInput(body: unknown): MakeInput {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 60) : ''
  if (!name) throw new MakeError('bad_input', 'Пустое название', 400)
  const hint = typeof b.hint === 'string' ? b.hint.trim().slice(0, 240) : ''
  const tags = (Array.isArray(b.tags) ? b.tags : [])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().toLowerCase().slice(0, 24))
    .filter(Boolean)
    .slice(0, 8)
  return { name, hint, tags }
}

// ---------- промпт ----------

const PALETTE_TEXT: Record<string, string> = {
  ink: 'контур, глаза', brownDark: 'тёмно-коричневый', brown: 'коричневый', wood: 'дерево', woodLight: 'светлое дерево',
  ochre: 'охра', amber: 'янтарь', yellow: 'жёлтый', cream: 'кремовый', paper: 'бежевый', paperShade: 'тень бежевого', white: 'тёплый белый',
  brickDark: 'тёмно-красный', brick: 'красный', coral: 'коралл', peach: 'персик, розовый',
  greenDark: 'тёмно-зелёный', green: 'зелёный', greenSoft: 'мягкий зелёный', mint: 'мятный', tealDark: 'тёмная бирюза', teal: 'бирюза',
  navy: 'тёмно-синий', slateDark: 'тёмный серо-синий', slate: 'серо-синий', greyBlue: 'серо-голубой', ice: 'светло-голубой', frost: 'почти белый голубой',
  plum: 'сливовый', mauve: 'лиловый', grey: 'серый', greyLight: 'светло-серый',
}

const SYSTEM = `Ты рисуешь предметы для уютного мультфильма-дневника: милые плоские картинки-наклейки в SVG.

## Холст
- <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" stroke-linejoin="round" stroke-linecap="round">.
- Предмет по центру, крупно (занимает 70–90 единиц), стоит на нижней линии y≈95. Вид спереди или чуть сбоку.

## Стиль (как в образцах)
- Плоская заливка + тёмный контур #1b1410 толщиной 2.5 у каждой крупной формы.
- Объём двумя пятнами: тень справа-снизу — более тёмный цвет той же семьи (без контура, внутри формы), блик слева-сверху — светлый (белый или светлее).
- Порядок слоёв: заливка формы → тень и блик → контур той же формы (fill="none") → мелкие детали.
- Пухлые, чуть игрушечные пропорции; главная черта предмета крупная и узнаваемая. Мелочи не тоньше 1.5.
- 3–5 цветовых семей. Живым существам и погоде можно милое лицо: глаза-точки с бликом, румянец, маленькая улыбка.
- Нельзя: текст, буквы, цифры, логотипы, бренды, людей, оружие.

## Разрешено
- Элементы: svg, g, path, rect, circle, ellipse, polygon, polyline, line. Атрибуты геометрии, fill, stroke, stroke-width, stroke-linejoin, stroke-linecap, transform (translate/rotate/scale), opacity.
- Цвета — ТОЛЬКО эти hex (или none):
${Object.entries(PALETTE_HEX).map(([n, h]) => `${h} ${n} — ${PALETTE_TEXT[n] ?? ''}`).join('\n')}
- Не больше ${SVG_LIMITS.maxElements} элементов и ${SVG_LIMITS.maxChars} знаков; обычно хватает 15–40.

## Ответ
look — план до 12 слов: главная черта силуэта и цвета. Затем: id (латиница snake_case), ru, kk, en, stems (3–6 основ слова для поиска, от 3 букв, ru и kk), tags, hold (hand — в одной руке, both — в двух, ground — стоит на странице: дома, деревья, транспорт, мебель), fx (до 2: ${FX_KINDS.join(', ')}), svg — вся картинка одной строкой.`

const MAKE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['look', 'id', 'ru', 'kk', 'en', 'stems', 'tags', 'hold', 'fx', 'svg'],
  properties: {
    look: { type: 'string', description: 'план до 12 слов' },
    id: { type: 'string' },
    ru: { type: 'string' },
    kk: { type: 'string' },
    en: { type: 'string' },
    stems: { type: 'array', items: { type: 'string' } },
    tags: { type: 'array', items: { type: 'string' } },
    hold: { type: 'string', enum: [...HOLDS] },
    fx: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind'], properties: { kind: { type: 'string', enum: [...FX_KINDS] } } } },
    svg: { type: 'string', description: 'SVG 100×100 одной строкой' },
  },
} as const

/** SVG библиотеки с диска (assets/kit2d). На Vercel папку нужно включить в функцию (includeFiles). */
function librarySvg(id: string): string | null {
  try {
    return readFileSync(join(process.cwd(), 'assets/kit2d', `${id}.svg`), 'utf8').replace(/\s*\n\s*/g, '')
  } catch {
    return null
  }
}

/** 5 образцов: похожие по тегам картинки библиотеки + какао как эталон стиля. */
export function pickExemplars(input: MakeInput, n = 5): { model: KitModel; svg: string }[] {
  const out: { model: KitModel; svg: string }[] = []
  const cocoa = kitById('cocoa')
  const pool = [...similar(input.tags.length ? input.tags : ['home'], 12), ...(cocoa ? [cocoa] : [])]
  for (const m of pool) {
    if (out.length >= n - 1 && m.id !== 'cocoa') continue
    const svg = librarySvg(m.id)
    if (svg && !out.some((x) => x.model.id === m.id)) out.push({ model: m, svg })
    if (out.length >= n) break
  }
  return out
}

export function buildMakeUser(input: MakeInput, exemplars: { model: KitModel; svg: string }[]): string {
  return [
    'Образцы из библиотеки (так выглядит хорошая картинка):',
    ...exemplars.map((e) => `${e.model.id} (${e.model.ru}, hold ${e.model.hold}): ${e.svg}`),
    '',
    `Нарисуй предмет: «${input.name}».`,
    input.hint ? `Подсказка: ${input.hint}` : '',
    input.tags.length ? `Теги: ${input.tags.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)

/** Привести ответ к нашим правилам: свой id-префикс, by: claude, название из запроса, если пусто. */
function finish(p: KitPicture, input: MakeInput): KitPicture {
  const base = slug(p.id) || slug(p.en ?? '') || 'thing'
  return { ...p, id: `mk_${base}`.slice(0, 40), ru: p.ru || input.name, by: 'claude' }
}

/** Дорисовать предмет. Один повтор с ошибками проверки, всё в пределах timeoutMs. */
export async function runMake(input: MakeInput, opts: { model?: string; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<MakeRun> {
  const model = opts.model ?? process.env.MAKE_MODEL ?? MAKE_MODEL
  const timeoutMs = opts.timeoutMs ?? MAKE_TIMEOUT_MS
  const t0 = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  opts.signal?.addEventListener('abort', () => ac.abort())
  const usage = { input: 0, output: 0, cacheRead: 0 }
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: buildMakeUser(input, pickExemplars(input)) }]
  let firstErrors: string[] = []
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      let response: Anthropic.Message
      try {
        response = await getClient().messages.create(
          {
            model,
            max_tokens: 6000,
            system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
            messages,
            // без размышлений: предмет — это раскладка фигур по образцам, скорость важнее
            thinking: { type: 'disabled' },
            output_config: { effort: 'low', format: { type: 'json_schema', schema: MAKE_SCHEMA as unknown as Record<string, unknown> } },
          },
          { signal: ac.signal },
        )
      } catch (e) {
        if (ac.signal.aborted) throw new MakeError('timeout', `Дорисовка дольше ${timeoutMs} мс`, 504, firstErrors)
        if (e instanceof Anthropic.RateLimitError) throw new MakeError('rate_limited', 'Лимит запросов LLM', 429)
        if (e instanceof Anthropic.APIError) throw new MakeError('api', `LLM ${e.status ?? ''}: ${e.name}`, 502)
        throw new MakeError('api', e instanceof Error ? e.name : 'сеть', 502)
      }
      usage.input += response.usage.input_tokens
      usage.output += response.usage.output_tokens
      usage.cacheRead += response.usage.cache_read_input_tokens ?? 0
      if (response.stop_reason === 'refusal') throw new MakeError('refusal', 'Модель отказалась', 502)
      if (response.stop_reason === 'max_tokens') throw new MakeError('max_tokens', 'Ответ обрезан', 502)
      const text = response.content.find((c): c is Anthropic.TextBlock => c.type === 'text')?.text ?? ''
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        throw new MakeError('bad_json', 'Ответ не JSON', 502)
      }
      const check = validatePicture(raw, { fit: true })
      if (check.ok) {
        return { model: finish(check.picture!, input), attempts: attempt, firstErrors, latencyMs: Date.now() - t0, usage }
      }
      if (attempt === 1) {
        firstErrors = check.errors
        // повтор, только если хватит времени на второй ответ
        if (timeoutMs - (Date.now() - t0) < 4000) break
        messages.push({ role: 'assistant', content: text })
        messages.push({ role: 'user', content: `Проверка не прошла:\n- ${check.errors.slice(0, 12).join('\n- ')}\nИсправь и пришли весь ответ заново.` })
      } else {
        throw new MakeError('invalid', 'Предмет не прошёл проверку', 422, check.errors)
      }
    }
    throw new MakeError('invalid', 'Предмет не прошёл проверку', 422, firstErrors)
  } finally {
    clearTimeout(timer)
  }
}

// Лимит по IP: 30 дорисовок за 10 минут на экземпляр функции.
const hits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > (Number(process.env.MAKE_RATE_LIMIT) || 30)
}

export async function handleMake(body: unknown, ip: string): Promise<{ status: number; json: unknown; headers: Record<string, string> }> {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  try {
    if (rateLimited(ip)) throw new MakeError('rate_limited', 'Слишком много запросов, подождите', 429)
    const run = await runMake(parseMakeInput(body))
    headers['x-make-latency'] = String(run.latencyMs)
    headers['x-make-attempts'] = String(run.attempts)
    return { status: 200, json: run.model, headers }
  } catch (e) {
    const err = e instanceof MakeError ? e : new MakeError('api', 'Внутренняя ошибка', 500)
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
  const r = await handleMake(body, ip)
  return new Response(JSON.stringify(r.json), { status: r.status, headers: r.headers })
}

export default { fetch: (request: Request) => (request.method === 'POST' ? POST(request) : new Response('Method Not Allowed', { status: 405 })) }
