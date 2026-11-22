// Песня дня: POST /api/song, тело { day: текст записи, cards?: PhotoCard[] }, ответ — SongAdvice (3 настоящие песни + why).
// Человек написал день, а песню не указал: ИИ предлагает, под что этот день звучит. Только названия и исполнители
// настоящих известных песен — файлов нет (правило 7). Язык песен — по записи (казахские / русские / мировые).
// Haiku выбирает из проверенного списка (src/director/songList) по id: в свободном ответе она выдумывала песни.
// Модель — только claude-haiku-5-5, thinking выключен. Ключ читается здесь и никуда не уходит.
import Anthropic from '@anthropic-ai/sdk'
import { photoCardText, sanitizePhotoCard } from '../src/kit/scenePhoto'
import { entryLanguage, sanitizeSongAdvice } from '../src/kit/sceneSong'
import { LANG_GROUP, SONG_BY_ID, SONG_LIST, type ListedSong, type SongLang } from '../src/director/songList'
import type { PhotoCard, SongAdvice } from '../src/types/script'
import { dayLimitReply, overDayLimit, whoFromRequest } from './_dayLimit'

export const config = { maxDuration: 15 }

export const SONG_MODEL = 'claude-haiku-5-5'
export const SONG_TIMEOUT_MS = 12000

export class SongError extends Error {
  constructor(public code: 'bad_input' | 'refusal' | 'max_tokens' | 'bad_json' | 'api' | 'no_key' | 'rate_limited' | 'timeout' | 'empty', message: string, public status = 500) {
    super(message)
  }
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new SongError('no_key', 'ANTHROPIC_API_KEY не задан', 503)
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.DIRECTOR_BASE_URL || 'https://api.anthropic.com', timeout: 30_000, maxRetries: 0 })
  return client
}

export interface SongInput {
  day: string
  cards: PhotoCard[]
}

export function parseSongInput(body: unknown): SongInput {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>
  const day = typeof b.day === 'string' ? b.day.trim().slice(0, 3000) : ''
  const cards = (Array.isArray(b.cards) ? b.cards : []).slice(0, 5).map((c) => sanitizePhotoCard(c)).filter((c): c is PhotoCard => !!c)
  if (!day && !cards.length) throw new SongError('bad_input', 'Нужен текст дня или фото', 400)
  return { day, cards }
}

const LANG_NAME: Record<SongLang, string> = { kk: 'на казахском', kz_ru: 'казахстанский исполнитель, на русском', ru: 'на русском', world: 'мировая / классика' }

export const SONG_SYSTEM = `Ты — музыкальный редактор фильма-дневника. Человек написал о своём дне (и, может быть, приложил фото), а песню не выбрал. Предложи 3 песни, под которые этот день звучит.

Жёсткие правила:
1. Только НАСТОЯЩИЕ, широко известные песни, поэтому выбирай ТОЛЬКО из списка ниже, по id. Никогда не выдумывай песни, названия и исполнителей. Если не уверен — возьми другую песню из списка, в которой уверен.
2. Язык — по записи: казахская запись — две песни на казахском и одна любая; русская запись — две на русском (можно казахстанских исполнителей) и одна мировая; английская — мировые; смешанная — казахские и русские.
3. Три разные по темпу: одна медленнее, одна средняя, одна быстрее и радостнее — но все про ЭТОТ день: место, время суток, погоду, людей, настроение. Грустные песни — только если день грустный.
4. why у песни — одна короткая строка ПО-РУССКИ, почему она про этот день («вечер в кофейне с подругой, тепло и неспешно»). Без текста песни.
5. why всего совета — одна строка по-русски, как звучит день: «тёплая кофейня вечером → что-то медленное и тёплое».

Список (id — исполнитель — название — язык — настроение — темп 0..1):
${SONG_LIST.map((x) => `${x.id} — ${x.artist} — ${x.title} — ${LANG_NAME[x.lang]} — ${x.mood} — ${x.tempo}`).join('\n')}`

export const SONG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['why', 'songs'],
  properties: {
    why: { type: 'string', description: 'как звучит день, одна строка по-русски: «…» → «…»' },
    songs: {
      type: 'array',
      description: 'ровно 3 разные песни из списка',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'why'],
        properties: {
          id: { type: 'string', enum: SONG_LIST.map((x) => x.id) },
          why: { type: 'string', description: 'почему эта песня про этот день, одна строка по-русски' },
        },
      },
    },
  },
}

/**
 * Выбор Haiku → 3 песни из списка: только известные id, без повторов, язык по записи
 * (для казахской и русской — минимум две своих; недостающие — песни своего языка, ближайшие по энергии).
 */
export function resolveSongs(raw: unknown, day: string): SongAdvice | null {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { why?: unknown; songs?: unknown }
  const lang = entryLanguage(day)
  const group = LANG_GROUP[lang]
  const picks: { song: ListedSong; why: string }[] = []
  for (const p of Array.isArray(r.songs) ? r.songs : []) {
    const o = (p && typeof p === 'object' ? p : {}) as { id?: unknown; why?: unknown }
    const song = typeof o.id === 'string' ? SONG_BY_ID.get(o.id) : undefined
    if (!song || picks.some((x) => x.song.id === song.id)) continue
    picks.push({ song, why: typeof o.why === 'string' ? o.why : '' })
    if (picks.length === 3) break
  }
  if (!picks.length) return null
  const used = new Set(picks.map((x) => x.song.id))
  const nearest = (energy: number, langs: readonly SongLang[]) =>
    SONG_LIST.filter((x) => langs.includes(x.lang) && !used.has(x.id)).sort((a, b) => Math.abs(a.energy - energy) - Math.abs(b.energy - energy))[0]
  const fill = (energy: number, langs: readonly SongLang[]) => {
    const song = nearest(energy, langs)
    if (!song) return null
    used.add(song.id)
    return { song, why: `по настроению дня: ${song.mood}` }
  }
  // хотя бы одна песня на языке записи (просим две; выбор Haiku со своим «почему» меняем только если своих нет совсем)
  const own = () => picks.filter((x) => group.includes(x.song.lang)).length
  if (lang !== 'en' && !own()) {
    const i = picks.length - 1
    const swap = fill(picks[i].song.energy, group)
    if (swap) picks[i] = swap
  }
  // недостающие — сначала на языке записи (пока своих меньше двух), потом любые, ближе к энергии выбранных
  const mean = picks.reduce((a, x) => a + x.song.energy, 0) / picks.length
  while (picks.length < 3) {
    const add = fill(mean, lang !== 'en' && own() < 2 ? group : [...group, 'world'])
    if (!add) break
    picks.push(add)
  }
  return sanitizeSongAdvice({
    why: r.why,
    songs: picks.map((x) => ({ title: x.song.title, artist: x.song.artist, why: x.why || x.song.mood, tempo: x.song.tempo, energy: x.song.energy, ...(x.song.yt ? { yt: x.song.yt } : {}) })),
  })
}

const LANG: Record<ReturnType<typeof entryLanguage>, [string, string]> = {
  kk: ['казахский', 'две песни с пометкой «на казахском» и одна любая'],
  ru: ['русский', 'две песни с пометкой «на русском» или «казахстанский исполнитель, на русском» и одна мировая'],
  mixed: ['смешанный (казахский и русский)', 'одна «на казахском», одна на русском и одна любая'],
  en: ['английский', 'мировые'],
}

export function buildSongUser(input: SongInput): string {
  const [name, mix] = LANG[entryLanguage(input.day)]
  return [
    input.day ? `Запись дня (язык: ${name}):\n<<<\n${input.day}\n>>>` : 'Записи нет, только фото.',
    input.cards.length ? `Фото дня:\n${input.cards.map((c, i) => photoCardText(c, i)).join('\n')}` : 'Фото нет.',
    `Предложи 3 песни из списка: ${mix}.`,
  ].join('\n\n')
}

export interface SongRun {
  advice: SongAdvice
  latencyMs: number
}

export async function runSong(input: SongInput, opts: { timeoutMs?: number; signal?: AbortSignal } = {}): Promise<SongRun> {
  const t0 = Date.now()
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), opts.timeoutMs ?? SONG_TIMEOUT_MS)
  opts.signal?.addEventListener('abort', () => ac.abort())
  try {
    let res: Anthropic.Message
    try {
      res = await getClient().messages.create(
        {
          model: SONG_MODEL,
          max_tokens: 1000,
          system: [{ type: 'text', text: SONG_SYSTEM, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: buildSongUser(input) }],
          thinking: { type: 'disabled' },
          output_config: { effort: 'low', format: { type: 'json_schema', schema: SONG_SCHEMA as unknown as Record<string, unknown> } },
        },
        { signal: ac.signal },
      )
    } catch (e) {
      if (ac.signal.aborted) throw new SongError('timeout', 'Совет по песне дольше бюджета', 504)
      if (e instanceof Anthropic.RateLimitError) throw new SongError('rate_limited', 'Лимит запросов LLM', 429)
      if (e instanceof Anthropic.APIError) throw new SongError('api', `LLM ${e.status ?? ''}: ${e.name}`, 502)
      throw new SongError('api', e instanceof Error ? e.name : 'сеть', 502)
    }
    if (res.stop_reason === 'refusal') throw new SongError('refusal', 'Модель отказалась', 502)
    if (res.stop_reason === 'max_tokens') throw new SongError('max_tokens', 'Ответ обрезан', 502)
    const text = res.content.find((c): c is Anthropic.TextBlock => c.type === 'text')?.text ?? ''
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw new SongError('bad_json', 'Ответ не JSON', 502)
    }
    const advice = resolveSongs(raw, input.day)
    if (!advice) throw new SongError('empty', 'Песен нет', 422)
    return { advice, latencyMs: Date.now() - t0 }
  } finally {
    clearTimeout(timer)
  }
}

// Лимит по IP: 30 советов за 10 минут на экземпляр функции (SONG_RATE_LIMIT — для прогонов оценки).
const hits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 10 * 60_000)
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return list.length > (Number(process.env.SONG_RATE_LIMIT) || 30)
}

/** Общая логика для Vercel и dev-сервера. */
export async function handleSong(body: unknown, ip: string): Promise<{ status: number; json: unknown; headers: Record<string, string> }> {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  try {
    if (rateLimited(ip)) throw new SongError('rate_limited', 'Слишком много запросов, подождите', 429)
    // человек уже упёрся в лимит дней с ИИ — его сценки, фото, песни и дорисовки тоже без ИИ (api/_dayLimit.ts)
    if (overDayLimit(ip, 'aux')) return dayLimitReply(headers, ip)
    const run = await runSong(parseSongInput(body))
    headers['x-song-latency-ms'] = String(run.latencyMs)
    return { status: 200, json: run.advice, headers }
  } catch (e) {
    const err = e instanceof SongError ? e : new SongError('api', 'Внутренняя ошибка', 500)
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
  // «вошёл» — только по проверенному токену Supabase; иначе гость по IP
  const r = await handleSong(body, await whoFromRequest(ip, request.headers.get('authorization')))
  return new Response(JSON.stringify(r.json), { status: r.status, headers: r.headers })
}

export default { fetch: (request: Request) => (request.method === 'POST' ? POST(request) : new Response('Method Not Allowed', { status: 405 })) }
