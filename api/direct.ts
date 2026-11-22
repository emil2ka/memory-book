// Серверная функция режиссёра: POST /api/direct, тело = DirectorInput, ответ = DayScript.
// Vercel (Web-сигнатура) и локальный dev через плагин в vite.config.ts зовут одну и ту же логику.
// Ключ читается только здесь, из process.env, и никогда не уходит в ответ или логи.
import Anthropic from '@anthropic-ai/sdk'
import { sanitizePhotoCard } from '../src/kit/scenePhoto'
import type { DayScript, DirectorInput } from '../src/types/script'
import { buildUserText, SYSTEM_PROMPT } from '../src/director/prompt'
import { buildScriptSchema } from '../src/director/schema'
import { validateScript } from '../src/director/validate'

export const config = { maxDuration: 30 }

export const DEFAULT_MODEL = 'claude-haiku-5-5'
type Effort = 'low' | 'medium' | 'high'

const SCRIPT_SCHEMA = buildScriptSchema()
const MAX_TEXT = 4000
const MAX_PHOTOS = 5
const MAX_PHOTO_CHARS = 2_000_000 // ~1,5 МБ base64 на фото

export class DirectorError extends Error {
  constructor(public code: 'bad_input' | 'refusal' | 'max_tokens' | 'bad_json' | 'api' | 'no_key' | 'rate_limited', message: string, public status = 500) {
    super(message)
  }
}

export interface DirectorRun {
  script: DayScript
  issues: string[]
  raw: unknown
  model: string
  latencyMs: number
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number }
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new DirectorError('no_key', 'ANTHROPIC_API_KEY не задан', 503)
  // Ключ и адрес задаём явно: окружение разработчика может содержать чужие ANTHROPIC_AUTH_TOKEN/ANTHROPIC_BASE_URL.
  client ??= new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.DIRECTOR_BASE_URL || 'https://api.anthropic.com',
    timeout: 25_000,
    maxRetries: 1,
  })
  return client
}

/** Проверка входа: текст, до 5 фото (data URL jpeg/png/webp/gif), песня. */
export function parseInput(body: unknown): DirectorInput {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const text = typeof b.text === 'string' ? b.text : ''
  if (!text.trim()) throw new DirectorError('bad_input', 'Пустой текст', 400)
  if (text.length > MAX_TEXT) throw new DirectorError('bad_input', `Текст длиннее ${MAX_TEXT} символов`, 400)
  const photos = (Array.isArray(b.photos) ? b.photos : [])
    .filter((p): p is string => typeof p === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,/.test(p) && p.length <= MAX_PHOTO_CHARS)
    .slice(0, MAX_PHOTOS)
  const s = b.song as Record<string, unknown> | null | undefined
  const song = s && typeof s === 'object'
    ? {
        title: typeof s.title === 'string' ? s.title.slice(0, 200) : undefined,
        artist: typeof s.artist === 'string' ? s.artist.slice(0, 200) : undefined,
        measuredTempoBpm: typeof s.measuredTempoBpm === 'number' && s.measuredTempoBpm > 0 ? s.measuredTempoBpm : undefined,
        bpm: typeof s.bpm === 'number' && s.bpm >= 40 && s.bpm <= 220 ? s.bpm : undefined,
        energy: typeof s.energy === 'number' && s.energy >= 0 && s.energy <= 1 ? s.energy : undefined,
        mood: typeof s.mood === 'string' ? s.mood.slice(0, 120) : undefined,
      }
    : null
  // карточки снимков (по индексу фото): режиссёр читает их текстом вместо картинок
  const photoCards = Array.isArray(b.photoCards) ? b.photoCards.slice(0, MAX_PHOTOS).map((c) => sanitizePhotoCard(c)) : undefined
  const hero = b.hero === 'boy' || b.hero === 'girl' ? b.hero : undefined
  return { text, photos, song, ...(photoCards && photoCards.some(Boolean) ? { photoCards } : {}), ...(hero ? { hero } : {}) }
}

function imageBlock(dataUrl: string): Anthropic.ImageBlockParam {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.*)$/s.exec(dataUrl)!
  return { type: 'image', source: { type: 'base64', media_type: m[1] as 'image/jpeg', data: m[2] } }
}

/** Один вызов LLM на день. Бросает DirectorError при отказе, обрыве или кривом JSON. */
export async function runDirector(input: DirectorInput, opts: { model?: string; effort?: Effort; signal?: AbortSignal; thinking?: 'off' | 'default' } = {}): Promise<DirectorRun> {
  const model = opts.model ?? process.env.DIRECTOR_MODEL ?? DEFAULT_MODEL
  const effort = opts.effort ?? ((process.env.DIRECTOR_EFFORT as Effort | undefined) || 'low')
  // без размышлений режиссёр отвечает в 2–3 раза быстрее; фильм должен стартовать через несколько секунд после «Собрать»
  const thinking = opts.thinking ?? ((process.env.DIRECTOR_THINKING as 'off' | 'default' | undefined) || 'off')
  const t0 = Date.now()
  let response: Anthropic.Message
  try {
    response = await getClient().messages.create(
      {
        model,
        max_tokens: 8000,
        // Стабильный системный промпт (роль, принципы, каталог, примеры) — кешируется.
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [
          {
            role: 'user',
            content: [...input.photos.map(imageBlock), { type: 'text', text: buildUserText(input) }],
          },
        ],
        ...(thinking === 'off' ? { thinking: { type: 'disabled' as const } } : {}),
        output_config: { effort, format: { type: 'json_schema', schema: SCRIPT_SCHEMA } },
      },
      { signal: opts.signal },
    )
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new DirectorError('rate_limited', 'Лимит запросов LLM', 429)
    if (e instanceof Anthropic.APIError) throw new DirectorError('api', `LLM ${e.status ?? ''}: ${e.name}`, 502)
    throw new DirectorError('api', e instanceof Error ? e.name : 'сеть', 502)
  }
  const latencyMs = Date.now() - t0
  if (response.stop_reason === 'refusal') throw new DirectorError('refusal', 'Модель отказалась', 502)
  if (response.stop_reason === 'max_tokens') throw new DirectorError('max_tokens', 'Ответ обрезан', 502)
  const textBlock = response.content.find((c): c is Anthropic.TextBlock => c.type === 'text')
  let raw: unknown
  try {
    raw = JSON.parse(textBlock?.text ?? '')
  } catch {
    throw new DirectorError('bad_json', 'Ответ не JSON', 502)
  }
  const { script, issues } = validateScript(raw, input.text, { photos: Math.max(input.photos.length, input.photoCards?.length ?? 0), cards: input.photoCards, hero: input.hero })
  const u = response.usage
  return {
    script,
    issues,
    raw,
    model: response.model,
    latencyMs,
    usage: {
      input: u.input_tokens,
      output: u.output_tokens,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
    },
  }
}

// Простой лимит по IP: 12 запросов за 10 минут на экземпляр функции (DIRECTOR_RATE_LIMIT — для прогонов оценки).
const hits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > (Number(process.env.DIRECTOR_RATE_LIMIT) || 12)
}

/** Общая логика для Vercel и dev-сервера. */
export async function handleDirect(body: unknown, ip: string): Promise<{ status: number; json: unknown; headers: Record<string, string> }> {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  try {
    if (rateLimited(ip)) throw new DirectorError('rate_limited', 'Слишком много запросов, подождите', 429)
    const input = parseInput(body)
    const run = await runDirector(input)
    headers['x-director-model'] = run.model
    headers['x-director-latency'] = String(run.latencyMs)
    headers['x-director-issues'] = String(run.issues.length)
    headers['x-director-cache-read'] = String(run.usage.cacheRead)
    return { status: 200, json: run.script, headers }
  } catch (e) {
    const err = e instanceof DirectorError ? e : new DirectorError('api', 'Внутренняя ошибка', 500)
    return { status: err.status, json: { error: err.code, message: err.message }, headers }
  }
}

/** Vercel Functions, Web-сигнатура. */
export async function POST(request: Request): Promise<Response> {
  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    body = null
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const r = await handleDirect(body, ip)
  return new Response(JSON.stringify(r.json), { status: r.status, headers: r.headers })
}

export default { fetch: (request: Request) => (request.method === 'POST' ? POST(request) : new Response('Method Not Allowed', { status: 405 })) }
