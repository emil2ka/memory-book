// Эмоции и действия человечка (план 15, сторителлинг): бит-чувство («мне было скучно») — это не предмет, а анимация;
// рассказ называет чувство, человечек его играет. Haiku выбирает у каждого бита emotion и act по полю when.
// Список — HERO_ACTIONS (src/actors/heroActions.ts, сессия mb-anim): id, when, kind. Здесь — порядок и стемы
// для запасного режиссёра и проверки (по словам цитаты и строки рассказа).
import { HERO_ACTIONS } from '../actors/heroActions'

export interface HeroMove {
  id: string
  /** Когда играть — для выбора Haiku (из HERO_ACTIONS). */
  when: string
  /** Слова записи, по которым это узнаёт код. */
  stems: RegExp
}

// порядок важен: «скучал по нему» — одиночество, а не скука; «засмеялся» — смех, а не радость; «ура» — восторг
const EMOTION_STEMS: Record<string, RegExp> = {
  lonely: /одинок|никого рядом|один дома|скучал[аи]? по|скучаю по|соскучил/,
  bored: /скук|скучн|скучал|нудн|надоел|тоскливо|нечего делать|однообраз/,
  cry: /плакал|плачу|слез|рыдал|разревел/,
  sad: /груст|печал|расстро|тоск|жаль|разочаров/,
  laugh: /смея|смех|засмеял|хохот|смешн|ржал|шутк/,
  excited: /восторг|ура\b|не верится|сбылось|победа|победил|сдал/,
  joy: /радост|радов|\bрад[аы]?\b|счаст|весел|кайф|здорово|классно|круто|повезло|приятно/,
  love: /любл|люби|влюб|нежн|свидани|нравит/,
  sleepy: /хочу спать|хотел[аи]? спать|не выспал|проспал|рано встал|сонн|клевал носом|зева/,
  tired: /устал|вымота|без сил|выдохся|измотан|тяжел[а-я]* день/,
  angry: /злил|злюсь|злой|злая|злость|бесил|бесит|раздраж|поругал|несправедлив/,
  scared: /страшн|страх|испуг|боял|боюсь|жутк/,
  surprised: /удивил|удивл|неожидан|не ожидал|не поверил|сюрприз|ого\b/,
  nervous: /волнов|волнуюсь|нервнич|пережива|тревож|паник|опаздыв/,
  proud: /горд|получилось|справил|похвалил/,
  think: /думал|задумал|размышл|вспомин|понял|поняла|сомнева|решал/,
  calm: /спокой|умиротвор|расслаб|тихо\b|тишин|уютн|выдохнул|отдохнул/,
}
const ACT_STEMS: Record<string, RegExp> = {
  run: /бежал|бегом|побежал|спешил|торопил|пробежк/,
  dance: /танцев|танцы|дискотек|вечеринк/,
  hug: /обнял|обнима|обнялись/,
  read: /читал|читали|прочитал|книг|библиотек/,
  write: /писал|конспект|домашк|письмо|сочинени/,
  phone: /телефон|позвонил|позвонила|звонил|переписыв|звонок|соцсет/,
  eat: /\bели\b|поели|обед|ужин|завтрак|съел|вкусн/,
  cook: /готовил|пекли|напекл|варил|испекл|жарил/,
  sleep: /\bспал\b|уснул|заснул|лёг спать|лег спать|отсыпал/,
  guitar: /гитар|домбр|играл[аи]? на|пели\b/,
  photo: /фотограф|снимал|селфи|сфоткал/,
  clap: /хлопал|аплодир|поздравля/,
  point: /показал|смотри\b|увидел/,
  look: /гуляли|гулял|погулять|гулять|искал|путешеств|новое место/,
  throw: /снежк|бросил|кинул|кидал/,
  kick: /футбол|пинал|мяч/,
}

const fromWhen = (when: string) => {
  const w = when
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((x) => x.length >= 4)
    .map((x) => x.slice(0, Math.max(4, x.length - 2)))
  return w.length ? new RegExp(w.join('|')) : /$^/
}
const ORDER = Object.keys(EMOTION_STEMS)
const order = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length)

/** Эмоции человечка (HERO_ACTIONS kind 'emotion') в порядке узнавания. */
export const EMOTIONS: readonly HeroMove[] = HERO_ACTIONS.filter((a) => a.kind === 'emotion')
  .map((a) => ({ id: a.id as string, when: a.when, stems: EMOTION_STEMS[a.id] ?? fromWhen(a.when) }))
  .sort((a, b) => order(a.id) - order(b.id))
/** Действия человечка (HERO_ACTIONS kind 'action'). */
export const ACTS: readonly HeroMove[] = HERO_ACTIONS.filter((a) => a.kind === 'action').map((a) => ({ id: a.id as string, when: a.when, stems: ACT_STEMS[a.id] ?? fromWhen(a.when) }))

export const EMOTION_IDS: readonly string[] = EMOTIONS.map((e) => e.id)
export const ACT_IDS: readonly string[] = ACTS.map((e) => e.id)
export const isEmotion = (v: unknown): v is string => typeof v === 'string' && EMOTION_IDS.includes(v)
export const isAct = (v: unknown): v is string => typeof v === 'string' && ACT_IDS.includes(v)

/** Запасная поза каталога для эмоции — её играет сцена, которая HERO_ACTIONS ещё не знает. */
export const EMOTION_POSE: Record<string, 'sit' | 'cheer' | 'shake' | 'shiver'> = {
  bored: 'sit', sad: 'sit', cry: 'sit', lonely: 'sit', tired: 'sit', sleepy: 'sit', calm: 'sit', think: 'sit',
  joy: 'cheer', excited: 'cheer', laugh: 'cheer', love: 'cheer', proud: 'cheer',
  surprised: 'shake', angry: 'shake', nervous: 'shake', scared: 'shiver',
}

const low = (s: string) => s.toLowerCase().replace(/ё/g, 'е')
/** Эмоция по словам фразы (первая подходящая по порядку); null — чувства в словах нет. */
export function emotionFromText(s: string): string | null {
  const t = low(s)
  return EMOTIONS.find((e) => e.stems.test(t))?.id ?? null
}
/** Действие человечка по словам фразы; null — нет. */
export function actFromText(s: string): string | null {
  const t = low(s)
  return ACTS.find((e) => e.stems.test(t))?.id ?? null
}

/** Текст эмоций и действий для промпта режиссёра. */
export function emotionsText(): string {
  return [
    'Эмоции человечка (emotion, что он чувствует): ' + EMOTIONS.map((e) => `${e.id} — ${e.when}`).join('; '),
    'Действия человечка (act, что он делает сам): ' + ACTS.map((e) => `${e.id} — ${e.when}`).join('; '),
  ].join('\n\n')
}
