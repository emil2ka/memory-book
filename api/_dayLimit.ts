// Лимит сборок с ИИ (решение Эмиля 22.11): за скользящие 7 суток гость без входа — 5 сборок сценария режиссёром ИИ,
// вошедший — 20. Сборка — новый день или пересборка после правки; пересмотр и сборка без изменений не считаются.
// «Вошёл» — только по проверенному токену Supabase (Authorization: Bearer <access_token>): сервер спрашивает
// /auth/v1/user и кэширует ответ на 5 минут. Без валидного токена — гость, счёт по IP. Голому x-mb-user не верим.
// Память — в экземпляре функции, «по мере сил»: холодный старт обнуляет счёт, клиент держит свой (src/kit/aiLimit.ts).
// Сверх лимита — 429 { error: 'day_limit' }: режиссёр не зовётся, клиент собирает день запасным режиссёром.
// Сценки, фото, песня и дорисовка (aux) того же человека запираются, пока он упирается в лимит.

export const GUEST_LIMIT = 5
export const USER_LIMIT = 20
export const DAY_LIMIT_TEXT = 'на этой неделе уже 20 сборок с ИИ — этот соберу сам'
export const GUEST_LIMIT_TEXT = 'без аккаунта — 5 сборок с ИИ в неделю. Войди, и будет 20 — этот соберу сам'
/** Предел для гостя или вошедшего; AI_DAY_LIMIT (локальная разработка, прогоны) заменяет оба. */
export const aiDayLimit = (user: boolean) => Number(process.env.AI_DAY_LIMIT) || (user ? USER_LIMIT : GUEST_LIMIT)
/** Окно лимита — скользящие 7 суток. */
export const AI_WINDOW_MS = 7 * 24 * 3600_000

interface Rec {
  /** когда начинались сборки с ИИ (мс) */
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

/** Кто: «u:<user id>» — вошёл (токен проверен), иначе IP гостя. */
export const whoOf = (ip: string, userId?: string | null) => (userId ? `u:${userId.slice(0, 64)}` : ip)
const isUser = (who: string) => who.startsWith('u:')

// ---------- проверка токена Supabase ----------

// адрес и публичный anon-ключ: из окружения функции или вшиты сборкой (tools/build-vercel.mjs, из .env.local)
const SUPABASE_URL = () => (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.BUILD_SUPABASE_URL || 'https://olrxgoawtalkvjakodad.supabase.co').replace(/\/+$/, '')
const SUPABASE_KEY = () => process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.BUILD_SUPABASE_ANON_KEY || ''
const tokenCache = new Map<string, { id: string | null; until: number }>()
const TOKEN_TTL = 5 * 60_000

/** id пользователя по токену Supabase (проверка на сервере Supabase, кэш 5 мин); null — токена нет или он не годится. */
export async function verifiedUser(authorization: string | null | undefined, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<string | null> {
  const m = /^Bearer\s+(\S{20,4096})$/i.exec(authorization ?? '')
  if (!m) return null
  const token = m[1]
  const hit = tokenCache.get(token)
  if (hit && hit.until > now) return hit.id
  let id: string | null = null
  try {
    const key = SUPABASE_KEY()
    const res = await fetchImpl(`${SUPABASE_URL()}/auth/v1/user`, {
      headers: { ...(key ? { apikey: key } : {}), authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    })
    if (res.ok) {
      const u = (await res.json()) as { id?: unknown }
      id = typeof u.id === 'string' && u.id ? u.id : null
    }
  } catch {
    id = null
  }
  tokenCache.set(token, { id, until: now + (id ? TOKEN_TTL : 30_000) })
  if (tokenCache.size > 5000) tokenCache.clear()
  return id
}

/** Кто сделал запрос: проверенный пользователь или IP гостя. */
export async function whoFromRequest(ip: string, authorization: string | null | undefined): Promise<string> {
  return whoOf(ip, await verifiedUser(authorization))
}

/**
 * true — сверх лимита (отказать 429 day_limit). kind 'direct' — сборка с режиссёром: при разрешении считается;
 * 'aux' — сценка, фото, песня, дорисовка: запирается, только если человек упёрся в лимит и окно ещё не освободилось.
 */
export function overDayLimit(who: string, kind: 'direct' | 'aux', now = Date.now()): boolean {
  const r = rec(who, now)
  const full = r.days.length >= aiDayLimit(isUser(who))
  if (kind === 'aux') return r.overAt > 0 && full
  if (full) {
    r.overAt = now
    return true
  }
  r.days.push(now)
  return false
}

/** Ответ 429 «лимит сборок с ИИ» (текст — для гостя или вошедшего). */
export const dayLimitReply = (headers: Record<string, string>, who = '') => ({
  status: 429,
  json: { error: 'day_limit', guest: !isUser(who), message: isUser(who) ? DAY_LIMIT_TEXT : GUEST_LIMIT_TEXT },
  headers,
})

/** Сбросить счёт и кэш токенов (тесты). */
export const resetDayLimit = () => {
  recs.clear()
  tokenCache.clear()
}
