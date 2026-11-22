// Проверка глазами (план 13): Haiku смотрит картинку и отвечает, что на ней. Общая часть для мастера моделей
// (api/_model.ts), сценографа (api/scene.ts) и теста узнавания (eval/recognize.ts).
// Файл с «_» — не отдельная функция Vercel. Модель — только claude-haiku-5-5; thinking выключен (иначе нет текста).
import Anthropic from '@anthropic-ai/sdk'

export const LOOK_MODEL = 'claude-haiku-5-5'

let client: Anthropic | null = null
export function lookClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY не задан')
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: process.env.DIRECTOR_BASE_URL || 'https://api.anthropic.com', timeout: 30_000, maxRetries: 1 })
  return client
}

/** Один вопрос с ответом по JSON-схеме, без размышлений. */
export async function askJson<T>(content: Anthropic.ContentBlockParam[], system: string, schema: Record<string, unknown>, maxTokens: number, signal?: AbortSignal): Promise<T> {
  const r = await lookClient().messages.create(
    {
      model: LOOK_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content }],
      thinking: { type: 'disabled' },
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    },
    signal ? { signal } : undefined,
  )
  const text = r.content.find((c): c is Anthropic.TextBlock => c.type === 'text')?.text ?? '{}'
  return JSON.parse(text) as T
}

export const imageBlock = (base64: string, mediaType: 'image/png' | 'image/jpeg' = 'image/png'): Anthropic.ImageBlockParam => ({
  type: 'image',
  source: { type: 'base64', media_type: mediaType, data: base64 },
})

// ---------- совпадение ----------

const STOP = new Set(['с', 'на', 'в', 'и', 'у', 'из', 'для', 'по', 'от', 'до', 'за', 'под', 'над', 'или', 'это', 'его', 'её', 'там'])
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w))
const stem = (w: string) => w.slice(0, Math.max(4, w.length - 2))

/**
 * Казахские вещи и блюда зритель называет ближайшим понятием (mb-assets: их не узнают, как ни рисуй).
 * В тесте узнавания засчитываем и его: кобыз → смычковый инструмент, асыки → косточки.
 */
export const CONCEPT: Record<string, string> = {
  шанырак: 'купол юрты, круглая решётка, колесо',
  торсык: 'кожаная фляга, бурдюк, сосуд',
  'кумыс в торсыке': 'кожаная фляга, бурдюк, сосуд',
  асыки: 'косточки, кости, игральные кубики',
  кобыз: 'смычковый инструмент, скрипка, виолончель',
  'ак калпак': 'войлочная шляпа, белая шапка',
  калпак: 'войлочная шляпа, белая шапка',
  сырмак: 'узорный ковёр, ковёр',
  'ковёр сырмак': 'узорный ковёр, ковёр',
  саукеле: 'высокий головной убор, корона, конусная шапка',
  тюбетейка: 'шапочка, ермолка, шапка',
  домбра: 'струнный инструмент, балалайка, гитара',
  баурсаки: 'пончики, булочки, жареное тесто',
  курт: 'сырные шарики, шарики',
  казан: 'котёл, кастрюля',
  бешбармак: 'блюдо с мясом и тестом, мясо с лапшой',
  дастархан: 'стол с угощением, накрытый стол',
  'дастархан с угощением': 'стол с угощением, накрытый стол',
  кесе: 'пиала, чашка',
  'кесе с чаем': 'пиала, чашка чая',
  юрта: 'шатёр, круглый домик',
  беркут: 'орёл, птица',
  // вещи со стола на диораме фото (mb-assets, 22.11): Haiku называет их общим словом
  самса: 'треугольный пирожок, пирожок, выпечка',
  лепёшка: 'круглый хлеб, хлеб, лепёшка',
  лепешка: 'круглый хлеб, хлеб, лепёшка',
  самовар: 'большой чайник, медный кувшин, сосуд для чая',
  чай: 'чашка чая, кружка чая, кружка',
  манты: 'пельмени, большие пельмени',
  казы: 'колбаса, кольцо колбасы',
}
const conceptOf = (s: string) => CONCEPT[s.trim().toLowerCase().replace(/ё/g, 'е')] ?? CONCEPT[s.trim().toLowerCase()]

/** Совпадение по основам слов: «кленовый лист» ~ «лист клёна», «какао» ~ «какао с пеной». */
export function stemMatch(expected: string, answer: string): boolean {
  const a = norm(answer)
  if (!a.length) return false
  return norm(expected).some((e) => {
    const se = stem(e)
    return a.some((x) => x.startsWith(se) || e.startsWith(stem(x)))
  })
}

const JUDGE_SCHEMA = { type: 'object', additionalProperties: false, required: ['match'], properties: { match: { type: 'boolean' } } } as const

/** Второй вопрос, только текстом: тот же предмет или очень близкий (синоним, разновидность)? */
export async function judge(expected: string, answer: string, what: 'предмет' | 'место', signal?: AbortSignal): Promise<{ match: boolean; ms: number }> {
  if (!answer.trim()) return { match: false, ms: 0 }
  const t0 = Date.now()
  const r = await askJson<{ match: boolean }>(
    [{ type: 'text', text: `Ожидаемый ${what}: «${expected}». Зритель увидел: «${answer}». Это тот же ${what} или очень близкий: синоним, разновидность, то же блюдо или вещь в другой форме (омлет ~ яичница, кружка какао ~ чашка горячего шоколада)? Если зритель увидел другое — false.` }],
    'Ты строгий судья совпадений. Отвечай только JSON.',
    JUDGE_SCHEMA as unknown as Record<string, unknown>,
    50,
    signal,
  )
  return { match: !!r.match, ms: Date.now() - t0 }
}

/** Совпадает ли ответ зрителя с ожидаемым: сначала основы слов, потом судья. */
export async function sameThing(expected: string, answer: string, what: 'предмет' | 'место' = 'предмет', signal?: AbortSignal): Promise<{ match: boolean; how: 'stem' | 'judge' | 'none'; ms: number }> {
  const concept = conceptOf(expected)
  if (stemMatch(expected, answer) || (concept && stemMatch(concept, answer))) return { match: true, how: 'stem', ms: 0 }
  const j = await judge(concept ? `${expected} (или ближайшее понятие: ${concept})` : expected, answer, what, signal)
  return { match: j.match, how: j.match ? 'judge' : 'none', ms: j.ms }
}

/**
 * Мягкий вопрос для мест (стенд — упрощённый признак места): «может ли это быть <место>?».
 * «высокое здание» ~ «квартира», «домик с беседкой» ~ «университет» — да, если узнаваемый признак подходит.
 */
export async function couldBe(expected: string, answer: string, signal?: AbortSignal): Promise<{ match: boolean; how: 'stem' | 'judge' | 'none'; ms: number }> {
  if (stemMatch(expected, answer)) return { match: true, how: 'stem', ms: 0 }
  if (!answer.trim()) return { match: false, how: 'none', ms: 0 }
  const t0 = Date.now()
  const r = await askJson<{ match: boolean }>(
    [{ type: 'text', text: `В мультфильме место показано одной игрушечной постройкой или предметом. Зритель увидел: «${answer}». Может ли это быть место «${expected}» — подходит ли увиденное как его узнаваемый упрощённый признак? Если это явно другое место или предмет — false.` }],
    'Ты судья для мультфильма. Отвечай только JSON.',
    JUDGE_SCHEMA as unknown as Record<string, unknown>,
    50,
    signal,
  )
  return { match: !!r.match, how: r.match ? 'judge' : 'none', ms: Date.now() - t0 }
}

// ---------- что держит человечек ----------

const WHAT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['thing'],
  properties: { thing: { type: 'string', description: '1–3 слова по-русски' } },
} as const

/** Мастеру: что за предмет у человечка (в руках или рядом). 1–3 слова. */
export async function whatIsIt(pngBase64: string, role: 'hand' | 'stand', signal?: AbortSignal): Promise<{ thing: string; ms: number }> {
  const t0 = Date.now()
  const r = await askJson<{ thing: string }>(
    [imageBlock(pngBase64), { type: 'text', text: role === 'hand' ? 'Что держит человечек? Ответь 1–3 словами.' : 'Что стоит рядом с человечком? Ответь 1–3 словами.' }],
    'Ты смотришь кадр из пиксельного мультфильма: маленький человечек и игрушечный объёмный предмет на бумаге. Назови предмет так, как его назвал бы зритель с первого взгляда. Отвечай по-русски.',
    WHAT_SCHEMA as unknown as Record<string, unknown>,
    60,
    signal,
  )
  return { thing: String(r.thing ?? '').trim(), ms: Date.now() - t0 }
}
