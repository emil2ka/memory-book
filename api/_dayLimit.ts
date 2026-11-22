// Лимит дней с ИИ (решение Эмиля 22.11): не больше AI_DAY_LIMIT (7) новых дней с режиссёром ИИ за скользящие 7 суток
// на человека — «как раз ровно», один день дневника в день. По IP и по id пользователя, если вошёл (заголовок x-mb-user).
// Память — в экземпляре функции, «по мере сил»: холодный старт обнуляет счёт, клиент держит свой (src/kit/aiLimit.ts).
// Сверх лимита — 429 { error: 'day_limit' }: режиссёр не зовётся, клиент собирает день запасным режиссёром.
// Сценки, фото, песня и дорисовка (aux) того же человека запираются, пока он упирается в лимит.

export const DAY_LIMIT_TEXT = 'на этой неделе уже 7 дней с ИИ — этот соберу сам'
export const aiDayLimit = () => Number(process.env.AI_DAY_LIMIT) || 7
/** Окно лимита — скользящие 7 суток. */
export const AI_WINDOW_MS = 7 * 24 * 3600_000

interface Rec {
  /** когда начинались дни с ИИ (мс) */
  days: number[]
  /** когда упёрся в лимит (мс); вспомогательные вызовы запираются, пока лимит не освободится */
  overAt: number
}
const recs = new Map<string, Rec>()

function rec(key: string, now: number): Rec {
  let r = recs.get(key)
  if (!r) {
    r = { days: [], overAt: 0 }
    recs.set(key, r)
    if (recs.size > 20000) recs.clear()
  }
  r.days = r.days.filter((t) => now - t < AI_WINDOW_MS)
  return r
}

/** Кто: «ip» или «ip|u:<user id>» (как передают POST-обёртки). */
export const whoOf = (ip: string, user?: string | null) => (user ? `${ip}|u:${user.slice(0, 64)}` : ip)

/**
 * true — сверх лимита (отказать 429 day_limit). kind 'direct' — новый день с режиссёром: при разрешении считается;
 * 'aux' — сценка, фото, песня, дорисовка: запирается, только если человек упёрся в лимит и окно ещё не освободилось.
 */
export function overDayLimit(who: string, kind: 'direct' | 'aux', now = Date.now()): boolean {
  const list = who.split('|').filter(Boolean).map((k) => rec(k, now))
  const full = (r: Rec) => r.days.length >= aiDayLimit()
  if (kind === 'aux') return list.some((r) => r.overAt > 0 && full(r))
  if (list.some(full)) {
    for (const r of list) r.overAt = now
    return true
  }
  for (const r of list) r.days.push(now)
  return false
}

/** Ответ 429 «лимит дней с ИИ». */
export const dayLimitReply = (headers: Record<string, string>) => ({ status: 429, json: { error: 'day_limit', message: DAY_LIMIT_TEXT }, headers })

/** Сбросить счёт (тесты). */
export const resetDayLimit = () => recs.clear()
