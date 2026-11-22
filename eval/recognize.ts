// Тест узнавания (план 13 § 2): кадр бита на пике → Haiku смотрит картинку и говорит, что там происходит →
// совпадает ли это с главным предметом (hero_prop), местом (place) и вторым человечком (companion).
// Только для сервера (dev-плагин eval/runServer.ts и скрипты eval/*): ключ из .env, в браузер не уходит.
// Модель — только claude-haiku-5-5; thinking выключен (иначе на короткий ответ нет текста).
import type Anthropic from '@anthropic-ai/sdk'
import { LOOK_MODEL, askJson, judge, sameThing, stemMatch } from '../api/_look'

export const RECOGNIZE_MODEL = LOOK_MODEL

export interface Seen {
  /** Что держит или что прямо перед главным человечком (1–3 слова). */
  held: string
  /** Где он, если место видно (1–3 слова), иначе пусто. */
  place: string
  /** Есть ли в кадре второй человечек. */
  second: boolean
  /** Что происходит, одна фраза. */
  phrase: string
}

export interface Expect {
  hero_prop: string
  place?: string | null
  companion?: { name: string; role: string } | null
  /**
   * Что сценка построила на самом деле (главный предмет — в руках, по-русски). Если задано, считаем и
   * builtMatch: узнан ли построенный предмет. Так видно, где сбой: сценка взяла не то (ИИ) или не читается (показ).
   */
  built?: string | null
}

export interface Recognition {
  seen: Seen
  /**
   * Совпадения: prop — главный предмет, place — место (null — места не ждали), companion — второй (null — не ждали),
   * built — построенный сценкой предмет в руках (null — не передан).
   */
  match: { prop: boolean; place: boolean | null; companion: boolean | null; built: boolean | null }
  /** Как решили совпадение предмета: по основам слов или вторым вопросом Haiku. */
  how: { prop: 'stem' | 'judge' | 'none'; place: 'stem' | 'judge' | 'none' | null }
  ms: { see: number; judge: number }
  /**
   * То же по полному кадру С ЦИТАТОЙ внизу (как видит зритель; Haiku можно читать подпись).
   * Основное (seen/match) — без подписи: полоска с цитатой закрашена бумагой.
   */
  withCaption?: { seen: Seen; match: { prop: boolean; place: boolean | null; companion: boolean | null } }
}

const SEE_SYSTEM = `Ты смотришь кадр из короткого мультфильма-дневника. На странице раскрытой книги стоит маленький пиксельный человечек, вокруг — игрушечные объёмные предметы. Опиши, что видит зритель с первого взгляда. Не угадывай по тексту на странице — только по предметам и фигуркам. Отвечай по-русски, коротко.`
/** С подписью: зритель видит внизу кадра рукописную полоску с цитатой — её можно учитывать. */
const SEE_SYSTEM_CAPTION = `Ты смотришь кадр из короткого мультфильма-дневника. На странице раскрытой книги стоит маленький пиксельный человечек, вокруг — игрушечные объёмные предметы; внизу кадра может быть рукописная полоска с цитатой — её можно учитывать, как обычный зритель. Опиши, что видит зритель с первого взгляда. Отвечай по-русски, коротко.`

const SEE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['held', 'place', 'second', 'phrase'],
  properties: {
    held: { type: 'string', description: 'что держит главный человечек или что прямо перед ним, 1–3 слова; пусто, если ничего' },
    place: { type: 'string', description: 'где он (место, если видно по предметам), 1–3 слова; пусто, если не видно' },
    second: { type: 'boolean', description: 'есть ли рядом второй человечек' },
    phrase: { type: 'string', description: 'что происходит, одна фраза' },
  },
} as const

const ask = <T>(content: Anthropic.ContentBlockParam[], system: string, schema: Record<string, unknown>, maxTokens: number) => askJson<T>(content, system, schema, maxTokens)

/** Что видно на кадре. Без подписи (по умолчанию) или с подписью — можно читать цитату внизу. */
export async function see(imageBase64: string, mediaType: 'image/png' | 'image/jpeg' = 'image/png', caption = false): Promise<{ seen: Seen; ms: number }> {
  const t0 = Date.now()
  const seen = await ask<Seen>(
    [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
      { type: 'text', text: 'Что держит человечек, где он, есть ли рядом второй человечек и что происходит?' },
    ],
    caption ? SEE_SYSTEM_CAPTION : SEE_SYSTEM,
    SEE_SCHEMA as unknown as Record<string, unknown>,
    300,
  )
  return { seen: { held: String(seen.held ?? ''), place: String(seen.place ?? ''), second: !!seen.second, phrase: String(seen.phrase ?? '') }, ms: Date.now() - t0 }
}

export { stemMatch, judge }

/** Сравнить увиденное с ожиданием (казахские вещи — и по ближайшему понятию, api/_look CONCEPT). */
async function matchSeen(seen: Seen, expect: Expect) {
  let judgeMs = 0
  // предмет: в руках или во фразе (зритель мог назвать его только во фразе)
  const p = await sameThing(expect.hero_prop, `в руках: ${seen.held || '—'}; происходит: ${seen.phrase}`, 'предмет')
  judgeMs += p.ms
  let place: boolean | null = null
  let howPlace: Recognition['how']['place'] = null
  if (expect.place) {
    const q = await sameThing(expect.place, `место: ${seen.place || '—'}; происходит: ${seen.phrase}`, 'место')
    judgeMs += q.ms
    place = q.match
    howPlace = q.how
  }
  return { prop: p.match, howProp: p.how, place, howPlace, companion: expect.companion ? seen.second : null, judgeMs }
}

/**
 * Полный тест одного кадра. image — кадр без подписи (полоска с цитатой закрашена); full — тот же кадр с подписью
 * (если передан — считаем и второе число, «с цитатой»).
 */
export async function recognize(imageBase64: string, expect: Expect, mediaType: 'image/png' | 'image/jpeg' = 'image/png', full?: string): Promise<Recognition> {
  const [a, b] = await Promise.all([see(imageBase64, mediaType, false), full ? see(full, mediaType, true) : Promise.resolve(null)])
  const m = await matchSeen(a.seen, expect)
  let judgeMs = m.judgeMs
  let built: boolean | null = null
  if (expect.built) {
    if (stemMatch(expect.built, expect.hero_prop)) built = m.prop
    else {
      const j = await sameThing(expect.built, `в руках: ${a.seen.held || '—'}; происходит: ${a.seen.phrase}`, 'предмет')
      judgeMs += j.ms
      built = j.match
    }
  }
  let withCaption: Recognition['withCaption']
  if (b) {
    const mc = await matchSeen(b.seen, expect)
    judgeMs += mc.judgeMs
    withCaption = { seen: b.seen, match: { prop: mc.prop, place: mc.place, companion: mc.companion } }
  }
  return { seen: a.seen, match: { prop: m.prop, place: m.place, companion: m.companion, built }, how: { prop: m.howProp, place: m.howPlace }, ms: { see: a.ms, judge: judgeMs }, withCaption }
}
