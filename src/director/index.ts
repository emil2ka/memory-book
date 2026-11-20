// Клиент режиссёра для браузера: POST /api/direct → проверка → DayScript.
// Ответ дольше timeoutMs (20 с) или любая ошибка → запасной сценарий из словаря.
// Если LLM ответит позже таймаута, onLateScript получит её сценарий (сцена может подменить, пока фильм не начался).
import type { DayScript, DirectorInput } from '../types/script'
import { fallbackDirect } from './fallback'
import { validateScript } from './validate'

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
  timeoutMs?: number
  endpoint?: string
  /** Вызывается, если LLM ответила уже после таймаута. */
  onLateScript?: (script: DayScript) => void
  fetchImpl?: typeof fetch
}

export async function directDay(input: DirectorInput, opts: DirectDayOptions = {}): Promise<DirectDayResult> {
  const timeoutMs = opts.timeoutMs ?? 20_000
  const doFetch = opts.fetchImpl ?? fetch
  const fallback = (reason: string): DirectDayResult => ({ script: fallbackDirect(input), source: 'fallback', reason })
  if (!input.text || !input.text.trim()) return fallback('пустой текст')

  const hardAbort = new AbortController()
  const hardTimer = setTimeout(() => hardAbort.abort(), Math.max(timeoutMs * 3, 60_000))

  const request = (async (): Promise<DirectDayResult> => {
    const res = await doFetch(opts.endpoint ?? '/api/direct', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
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
    const { script, issues } = validateScript(raw, input.text)
    return { script, source: 'llm', issues }
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
