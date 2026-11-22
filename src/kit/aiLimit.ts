// Лимит дней с ИИ на клиенте (решение Эмиля 22.11): 7 новых дней с ИИ за скользящие 7 суток — один день дневника в день.
// Счётчик — в localStorage (времена начала дней с ИИ), сервер держит свой (api/_dayLimit.ts, 429 day_limit).
// Сверх лимита день собирает запасной режиссёр — фильм всё равно получается; сценки — из библиотеки, песни — из
// проверенного списка без ИИ. Демо-дни и повторный просмотр сохранённых дней лимит не тратят.

export const AI_DAYS = 7
export const AI_WINDOW_MS = 7 * 24 * 3600_000
export const AI_DAY_NOTE = 'на этой неделе уже 7 дней с ИИ — этот соберу сам'
const KEY = 'mb-ai-days'

function read(now: number): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    if (Array.isArray(raw)) return raw.filter((t): t is number => typeof t === 'number' && now - t < AI_WINDOW_MS && t <= now + 60_000)
  } catch {
    /* нет хранилища или мусор */
  }
  return []
}
function write(days: number[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(days))
  } catch {
    /* приватный режим: счёт только в памяти сервера */
  }
}

/** Сколько новых дней с ИИ осталось в скользящей неделе. */
export const aiDaysLeft = (now = Date.now()) => Math.max(0, AI_DAYS - read(now).length)

/** null — день ещё пишется (черновик); true / false — этот день собирается с ИИ / без ИИ. */
let dayAi: boolean | null = null

/** Новый черновик: лимит решится при «Собрать». */
export function aiDraft(): void {
  dayAi = null
}

/** «Собрать»: взять день из лимита. false — лимит исчерпан, день собирается без ИИ. */
export function beginAiDay(now = Date.now()): boolean {
  const days = read(now)
  if (days.length >= AI_DAYS) {
    dayAi = false
    return false
  }
  write([...days, now])
  dayAi = true
  return true
}

/** Сервер ответил day_limit: неделя исчерпана, этот день — без ИИ. */
export function aiRefused(now = Date.now()): void {
  const days = read(now)
  while (days.length < AI_DAYS) days.push(now)
  write(days)
  dayAi = false
}

/**
 * Без ИИ сейчас: этот день собирается без ИИ, или черновик пишется, а лимит уже исчерпан
 * (тогда и песни под запись, и карточки фото — без ИИ). Во время фильма дня с ИИ — с ИИ, даже если он был последним.
 */
export const aiOff = (now = Date.now()) => dayAi === false || (dayAi === null && aiDaysLeft(now) <= 0)

/** Сбросить (тесты). */
export function resetAiLimit(): void {
  dayAi = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* нет хранилища */
  }
}
