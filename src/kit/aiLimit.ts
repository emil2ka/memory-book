// Лимит сборок с ИИ на клиенте (решение Эмиля 22.11): 20 сборок сценария режиссёром ИИ за скользящие 7 суток —
// новый день или пересборка после правки; пересмотр и сборка без изменений (тот же сценарий) не считаются.
// Счётчик — в localStorage (времена начала дней с ИИ), сервер держит свой (api/_dayLimit.ts, 429 day_limit).
// Сверх лимита день собирает запасной режиссёр — фильм всё равно получается; сценки — из библиотеки, песни — из
// проверенного списка без ИИ. Демо-дни и повторный просмотр сохранённых дней лимит не тратят.

/** Сборок с ИИ за скользящие 7 суток: вошедший — 20, гость без входа — 5. */
export const AI_DAYS = 20
export const AI_GUEST_DAYS = 5
export const AI_WINDOW_MS = 7 * 24 * 3600_000
export const AI_DAY_NOTE = 'на этой неделе уже 20 сборок с ИИ — этот соберу сам'
export const AI_GUEST_NOTE = 'без аккаунта — 5 сборок с ИИ в неделю. Войди, и будет 20 — этот соберу сам'

/** Вошёл ли человек (App подставляет currentUser из облака); по умолчанию — гость. */
let signedIn: () => boolean = () => false
export function setAiSignedIn(f: () => boolean): void {
  signedIn = f
}
/** Предел сборок для этого человека. */
export const aiLimitNow = () => (signedIn() ? AI_DAYS : AI_GUEST_DAYS)
/** Записка у сургуча, когда лимит исчерпан: гостю — про вход, вошедшему — про неделю. */
export const aiNoteText = () => (signedIn() ? AI_DAY_NOTE : AI_GUEST_NOTE)
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
export const aiDaysLeft = (now = Date.now()) => Math.max(0, aiLimitNow() - read(now).length)

/** null — день ещё пишется (черновик); true / false — этот день собирается с ИИ / без ИИ. */
let dayAi: boolean | null = null

/** Новый черновик: лимит решится при «Собрать». */
export function aiDraft(): void {
  dayAi = null
}

/** «Собрать»: взять день из лимита. false — лимит исчерпан, день собирается без ИИ. */
export function beginAiDay(now = Date.now()): boolean {
  const days = read(now)
  if (days.length >= aiLimitNow()) {
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
  while (days.length < aiLimitNow()) days.push(now)
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
