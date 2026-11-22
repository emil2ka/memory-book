// Клиент режиссёра для браузера: POST /api/direct → проверка → DayScript.
// Ответ дольше timeoutMs (20 с) или любая ошибка → запасной сценарий из словаря.
// Если LLM ответит позже таймаута, onLateScript получит её сценарий (сцена может подменить, пока фильм не начался).
import type { DayScript, DirectorInput, PhotoCard } from '../types/script'
import { photoCardsFor } from '../kit/scenePhoto'
import { songAdaptWhy } from '../kit/sceneSong'
import { fallbackDirect } from './fallback'
import { validateScript } from './validate'
import { matchPhotos } from './photos'

/** Строка «Фото» в «Почему так» по карточкам снимков (для запасного режиссёра). */
export function photoWhy(cards: readonly (PhotoCard | null)[]): string | null {
  const c = cards.filter((x): x is PhotoCard => !!x)
  if (!c.length) return null
  const parts = c.slice(0, 2).map((x) => [x.place.ru, ...x.people.slice(0, 1).map((p) => p.role), ...x.things.slice(0, 1).map((t) => t.ru)].filter(Boolean).join(', '))
  return `Фото: на фото ${parts.join('; ')} → они стали сценками дня`
}

export type DirectorSource = 'llm' | 'fallback'

export interface DirectDayResult {
  script: DayScript
  source: DirectorSource
  /** Почему ушли на запасной вариант (для отладки). */
  reason?: string
  /** Что пришлось починить в ответе LLM. */
  issues?: string[]
}

export interface DirectDayOptions {
  /** Сколько ждать карточки снимков, которые ещё готовятся (мс). */
  photoWaitMs?: number
  timeoutMs?: number
  endpoint?: string
  /** Вызывается, если LLM ответила уже после таймаута. */
  onLateScript?: (script: DayScript) => void
  fetchImpl?: typeof fetch
}

export async function directDay(input: DirectorInput, opts: DirectDayOptions = {}): Promise<DirectDayResult> {
  const timeoutMs = opts.timeoutMs ?? 20_000
  const doFetch = opts.fetchImpl ?? fetch
  // карточки снимков: готовые — сразу, идущие — ждём немного (их просили, как только фото добавлено)
  // App передаёт то, что уже пришло (null — ещё нет): пустые места добираем у клиента — готовые сразу, идущие ждём
  const given = input.photoCards ?? []
  const missing = (input.photos ?? []).some((_, i) => !given[i])
  const waited = missing ? await photoCardsFor(input.photos, input.text, opts.photoWaitMs ?? 6000, opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}) : []
  const cards: (PhotoCard | null)[] = (input.photos?.length ? input.photos : given).map((_, i) => given[i] ?? waited[i] ?? null)
  const hasCards = cards.some(Boolean)
  // строка «Песня»: как фильм подстроился под песню (и откуда она, если её предложил ИИ)
  const songLine = songAdaptWhy(input.song)
  const withCards = (script: DayScript): DayScript => {
    const s = hasCards ? { ...script, photo_cards: cards } : script
    return songLine ? { ...s, why: [s.why[0], s.why[1], songLine] } : s
  }
  const fallback = (reason: string): DirectDayResult => {
    const script = withCards(fallbackDirect(input))
    if (hasCards) for (const [i, p] of matchPhotos(script.beats, cards, { max: 3 })) script.beats[i] = { ...script.beats[i], photo: p }
    const why = photoWhy(cards)
    if (why) script.why = [script.why[0], why, script.why[2]]
    return { script, source: 'fallback', reason }
  }
  if (!input.text || !input.text.trim()) return fallback('пустой текст')
  // у всех снимков есть карточки — режиссёру хватит текста, картинки не шлём (быстрее)
  const allCards = !!input.photos?.length && cards.length === input.photos.length && cards.every(Boolean)
  const body: DirectorInput = { ...input, photos: allCards ? [] : input.photos, ...(hasCards ? { photoCards: cards } : {}) }

  const hardAbort = new AbortController()
  const hardTimer = setTimeout(() => hardAbort.abort(), Math.max(timeoutMs * 3, 60_000))

  const request = (async (): Promise<DirectDayResult> => {
    const res = await doFetch(opts.endpoint ?? '/api/direct', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: hardAbort.signal,
    })
    if (!res.ok) {
      let code = String(res.status)
      try {
        code = ((await res.json()) as { error?: string }).error ?? code
      } catch { /* тело не JSON */ }
      throw new Error(`api ${code}`)
    }
    const raw = await res.json()
    const { script, issues } = validateScript(raw, input.text, { photos: Math.max(input.photos?.length ?? 0, cards.length), cards, hero: input.hero })
    return { script: withCards(script), source: 'llm', issues }
  })()

  let timedOut = false
  const timeout = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), timeoutMs))
  try {
    const first = await Promise.race([request, timeout])
    if (first === 'timeout') {
      timedOut = true
      request
        .then((late) => opts.onLateScript?.(late.script))
        .catch(() => {})
        .finally(() => clearTimeout(hardTimer))
      return fallback('таймаут')
    }
    clearTimeout(hardTimer)
    return first
  } catch (e) {
    if (!timedOut) clearTimeout(hardTimer)
    return fallback(e instanceof Error ? e.message : 'ошибка')
  }
}

export { fallbackDirect } from './fallback'
export { validateScript, checkScript } from './validate'
