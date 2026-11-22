// Карточка снимка: POST /api/photo, тело { image: dataURL (jpeg ≤ 768 px), day?: текст дня }, ответ — PhotoCard.
// Haiku описывает фото ТОЛЬКО тем, что видно, сразу словами 3D-библиотеки (ref — только её id или "").
// Из карточки код собирает диораму (снимок оживает) и сценку бита (план 14 А+Б). Схема и промпт — из eval/photo-probe.ts.
// Модель — только claude-haiku-5-5, thinking выключен. Ключ читается здесь и никуда не уходит.
import Anthropic from '@anthropic-ai/sdk'
import companions from '../assets/kit/companions.json'
import { SCENE_LIBRARY } from '../src/kit/sceneCheck'
import { sanitizePhotoCard } from '../src/kit/scenePhoto'
import { COLOR_NAMES } from '../src/kit/validate'
import type { PhotoCard } from '../src/types/script'
import { dayLimitReply, overDayLimit, whoOf } from './_dayLimit'

export const config = { maxDuration: 15 }

export const PHOTO_MODEL = 'claude-haiku-5-5'
export const PHOTO_TIMEOUT_MS = 12000

export class PhotoError extends Error {
  constructor(public code: 'bad_input' | 'refusal' | 'max_tokens' | 'bad_json' | 'api' | 'no_key' | 'rate_limited' | 'timeout' | 'empty', message: string, public status = 500) {
    super(message)
  }
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new PhotoError('no_key', 'ANTHROPIC_API_KEY не задан', 503)
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.DIRECTOR_BASE_URL || 'https://api.anthropic.com', timeout: 30_000, maxRetries: 0 })
  return client
}

export interface PhotoInput {
  /** base64 без префикса */
  data: string
  media: 'image/jpeg' | 'image/png' | 'image/webp'
  day: string
}

export function parsePhotoInput(body: unknown): PhotoInput {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const image = typeof b.image === 'string' ? b.image : ''
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image)
  if (!m) throw new PhotoError('bad_input', 'Нужна картинка data:image/jpeg;base64,…', 400)
  if (m[2].length > 3_000_000) throw new PhotoError('bad_input', 'Слишком большая картинка (уменьшите до 768 px)', 413)
  return { data: m[2], media: m[1] as PhotoInput['media'], day: typeof b.day === 'string' ? b.day.trim().slice(0, 3000) : '' }
}

const places = SCENE_LIBRARY.filter((m) => m.scene === 'stand' || m.hold === 'ground')
const things = SCENE_LIBRARY.filter((m) => m.scene !== 'stand' && m.hold !== 'ground')
const acc = (companions as { accessories: string[] }).accessories

export const PHOTO_SYSTEM = `Ты смотришь на фото, которое человек приложил к записи о своём дне. По фото код соберёт крошечную объёмную диораму из готовых игрушечных предметов и пиксельных человечков: место сзади, 2–4 вещи, люди с фото — человечками в той же одежде. Лиц не будет, только цвета одежды и одна вещь на голове.
Опиши фото ТОЛЬКО тем, что видно. Каждую вещь и место переводи в id библиотеки (если подходящего нет — пустой ref и ru-название). Цвета — только имена палитры: ${COLOR_NAMES.join(', ')}.
Места (стенды): ${places.map((m) => `${m.id} — ${m.ru}`).join('; ')}
Вещи: ${things.map((m) => `${m.id} — ${m.ru}`).join('; ')}
Вещь на голове человечка — одна из: ${acc.join(', ')}.`

export const PHOTO_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['caption', 'place', 'things', 'people', 'time_of_day', 'weather', 'palette', 'mood', 'match'],
  properties: {
    caption: { type: 'string', description: 'подпись к фото от первого лица, 4–8 слов: «мы с подругой пьём какао в кофейне»' },
    place: {
      type: 'object',
      additionalProperties: false,
      required: ['ru', 'ref'],
      properties: { ru: { type: 'string' }, ref: { type: 'string', enum: ['', ...places.map((m) => m.id)] } },
    },
    things: {
      type: 'array',
      description: 'до 4 самых заметных вещей',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ru', 'ref', 'where'],
        properties: { ru: { type: 'string' }, ref: { type: 'string', enum: ['', ...SCENE_LIBRARY.map((m) => m.id)] }, where: { type: 'string', enum: ['hand', 'table', 'ground', 'wall', 'sky'] } },
      },
    },
    people: {
      type: 'array',
      description: 'до 3 человек на фото',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['role', 'jacket', 'scarf', 'hair', 'accessory', 'action'],
        properties: {
          role: { type: 'string', description: 'кто это по виду: подруга, друг, бабушка, ребёнок, мама…' },
          jacket: { type: 'string', enum: COLOR_NAMES },
          scarf: { type: 'string', enum: COLOR_NAMES },
          hair: { type: 'string', enum: COLOR_NAMES },
          accessory: { type: 'string', enum: acc },
          action: { type: 'string', enum: ['idle', 'cheer', 'drink', 'carry', 'sit', 'shiver', 'shake'] },
        },
      },
    },
    time_of_day: { type: 'string', enum: ['morning', 'day', 'evening', 'night'] },
    weather: { type: 'string', enum: ['clear', 'rain', 'snow', 'cloudy', 'fog'] },
    palette: { type: 'array', items: { type: 'string', enum: COLOR_NAMES } },
    mood: { type: 'string', description: '2–4 слова' },
    match: { type: 'string', description: 'точная фраза из текста дня, к которой относится это фото; пусто, если текста нет или ни одна не подходит' },
  },
} as const

export interface PhotoRun {
  card: PhotoCard
  latencyMs: number
}

export async function runPhoto(input: PhotoInput, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<PhotoRun> {
  const t0 = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? PHOTO_TIMEOUT_MS)
  opts.signal?.addEventListener('abort', () => ac.abort())
  try {
    let res: Anthropic.Message
    try {
      res = await getClient().messages.create(
        {
          model: PHOTO_MODEL,
          max_tokens: 2000,
          system: [{ type: 'text', text: PHOTO_SYSTEM, cache_control: { type: 'ephemeral' } }],
          messages: [
            {
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: input.media, data: input.data } },
                { type: 'text', text: input.day ? `Текст дня: «${input.day}». Опиши фото.` : 'Опиши фото.' },
              ],
            },
          ],
          thinking: { type: 'disabled' },
          output_config: { effort: 'low', format: { type: 'json_schema', schema: PHOTO_SCHEMA as unknown as Record<string, unknown> } },
        },
        { signal: ac.signal },
      )
    } catch (e) {
      if (ac.signal.aborted) throw new PhotoError('timeout', 'Карточка дольше бюджета', 504)
      if (e instanceof Anthropic.RateLimitError) throw new PhotoError('rate_limited', 'Лимит запросов LLM', 429)
      if (e instanceof Anthropic.APIError) throw new PhotoError('api', `LLM ${e.status ?? ''}: ${e.name}`, 502)
      throw new PhotoError('api', e instanceof Error ? e.name : 'сеть', 502)
    }
    if (res.stop_reason === 'refusal') throw new PhotoError('refusal', 'Модель отказалась', 502)
    if (res.stop_reason === 'max_tokens') throw new PhotoError('max_tokens', 'Ответ обрезан', 502)
    const text = res.content.find((c): c is Anthropic.TextBlock => c.type === 'text')?.text ?? ''
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw new PhotoError('bad_json', 'Ответ не JSON', 502)
    }
    const card = sanitizePhotoCard(raw)
    if (!card) throw new PhotoError('empty', 'На фото ничего не узнано', 422)
    return { card, latencyMs: Date.now() - t0 }
  } finally {
    clearTimeout(timer)
  }
}

// Лимит по IP: 40 снимков за 10 минут на экземпляр функции (PHOTO_RATE_LIMIT — для прогонов оценки).
const hits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > (Number(process.env.PHOTO_RATE_LIMIT) || 40)
}

/** Общая логика для Vercel и dev-сервера. */
export async function handlePhoto(body: unknown, ip: string): Promise<{ status: number; json: unknown; headers: Record<string, string> }> {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  try {
    if (rateLimited(ip)) throw new PhotoError('rate_limited', 'Слишком много запросов, подождите', 429)
    // человек уже упёрся в лимит дней с ИИ — его сценки, фото, песни и дорисовки тоже без ИИ (api/_dayLimit.ts)
    if (overDayLimit(ip, 'aux')) return dayLimitReply(headers)
    const run = await runPhoto(parsePhotoInput(body))
    headers['x-photo-latency-ms'] = String(run.latencyMs)
    return { status: 200, json: run.card, headers }
  } catch (e) {
    const err = e instanceof PhotoError ? e : new PhotoError('api', 'Внутренняя ошибка', 500)
    return { status: err.status, json: { error: err.code, message: err.message }, headers }
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
  const r = await handlePhoto(body, whoOf(ip, request.headers.get('x-mb-user')))
  return new Response(JSON.stringify(r.json), { status: r.status, headers: r.headers })
}

export default { fetch: (request: Request) => (request.method === 'POST' ? POST(request) : new Response('Method Not Allowed', { status: 405 })) }
