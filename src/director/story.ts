// Строки рассказа (план 15 § 1.1): голос книги слева сверху. К каждому биту — одна строка, 6–14 слов, от первого лица,
// в прошедшем времени, со связкой («утром», «потом», «а вечером»); все строки подряд — связный пересказ дня.
// Строки пишет режиссёр (Beat.story). Здесь: проверка его строки (длина, имена только из текста, без досочинённого)
// и запасной вариант — полное предложение бита из записи со связкой по порядку (без сети, старые дни, плохая строка).
// Род глаголов прошедшего времени у «я» — по герою (мальчик: «устал», девочка: «устала»): genderize.
import type { Beat, PhotoCard, TimeOfDay } from '../types/script'

/** Герой фильма: от него род «я» в строках рассказа. */
export type Hero = 'boy' | 'girl'
export interface StoryOpts {
  /** Пол героя (выбор «он / она»); нет — род как в записи. */
  hero?: Hero
  /** С чем сверять факты и имена: текст записи и подписи снимков (по умолчанию — текст). */
  ref?: string
}

/** Сколько слов в строке рассказа допускаем (просим 6–14). */
export const STORY_MIN_WORDS = 4
export const STORY_MAX_WORDS = 18

const wordsOf = (s: string) => s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w))
const kazakh = (s: string) => /[әғқңөұүһі]/i.test(s)

/** Начинается со связки или времени — свою не добавляем. */
const OPENER_RU = /^(утром|с утра|днём|днем|вечером|к вечеру|ночью|потом|затем|сначала|сперва|тогда|наконец|вдруг|сегодня|вчера|когда|а |и |но |уже )|^(в|во|к|под|с|после|до)\s+(\S+\s+)?(утр|вечер|ноч|обед|полд|полноч|час|выходн|суббот|воскрес|понедельн|вторн|сред|четверг|пятниц|пар|урок|школ|работ)/i
const OPENER_KK = /^(таңертең|түсте|кешке|түнде|алдымен|содан|кейін|сосын|бүгін|соңында|және |бірақ )/i

const TIME_RU: Record<TimeOfDay, string> = { morning: 'Утром', day: 'Днём', evening: 'Вечером', night: 'Ночью' }
const TIME_KK: Record<TimeOfDay, string> = { morning: 'Таңертең', day: 'Түсте', evening: 'Кешке', night: 'Түнде' }

/** Предложение записи, в котором стоит цитата (без конечной точки). */
export function sentenceOf(text: string, quote: string): string {
  const at = quote ? text.indexOf(quote) : -1
  if (at < 0) return quote.trim()
  let a = at
  while (a > 0 && !/[.!?…\n]/.test(text[a - 1])) a--
  let b = at + quote.length
  while (b < text.length && !/[.!?…\n]/.test(text[b])) b++
  return text.slice(a, b).replace(/\s+/g, ' ').replace(/^[\s—–\-«"]+/, '').trim()
}

/**
 * Часть предложения (между запятыми, тире) с цитатой; короче 5 слов — вместе со следующей
 * (и с предыдущей, если forward = false: предыдущую уже рассказал прошлый бит).
 */
function clauseOf(sentence: string, quote: string, forward = false): string {
  const parts = sentence.split(/\s*[,;:]\s+|\s+[—–]\s+/)
  const i = Math.max(0, parts.findIndex((p) => p.includes(quote)))
  let out = parts[i] ?? sentence
  if (wordsOf(out).length < 5 && parts[i + 1]) out = `${out}, ${parts[i + 1]}`
  if (!forward && wordsOf(out).length < 5 && i > 0) out = `${parts[i - 1]}, ${out}`
  return out
}

/** Части предложения (между запятыми, тире и перед «и / а / но / потом») с цитатой — без частей с чужими цитатами. */
function ownPart(sentence: string, quote: string, others: string[]): string {
  const parts = sentence.split(/\s*[,;:]\s+|\s+[—–]\s+|\s+(?=(?:и|а|но|потом|затем)\s)/)
  const i = Math.max(0, parts.findIndex((p) => p.includes(quote)))
  const foreign = (p: string) => others.some((q) => p.includes(q))
  let a = i
  let b = i
  while (wordsOf(parts.slice(a, b + 1).join(' ')).length < 5) {
    if (b + 1 < parts.length && !foreign(parts[b + 1])) b++
    else if (a > 0 && !foreign(parts[a - 1])) a--
    else break
  }
  return parts.slice(a, b + 1).join(', ').replace(/,\s+(?=(и|а|но|потом|затем)\s)/g, ' ')
}

/** Слово с большой буквы и в середине текста (в любой форме: «Амина» — «с Аминой») — имя: его не опускаем в нижний регистр. */
function isName(word: string, text: string): boolean {
  const w = word.replace(/[^\p{L}-]/gu, '')
  if (!w || w === 'Я' || !/^\p{Lu}/u.test(w)) return false
  const stem = w.slice(0, Math.max(3, w.length - 2)).replace(/[-]/g, '\\-')
  return new RegExp(`[\\p{L}\\p{N},;:]\\s+${stem}`, 'u').test(text)
}

const lowerFirst = (s: string, text: string) => {
  const first = s.split(/\s+/)[0] ?? ''
  return isName(first, text) ? s : s.charAt(0).toLowerCase() + s.slice(1)
}
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const tidy = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/^[\s—–\-«"„]+/, '')
    .replace(/[\s.…,;:—–\-»"“]+$/, '')
    .trim()

// ---------- род глаголов у «я» ----------

// существительные на -л / -ла, которые нельзя путать с глаголами прошедшего времени
const NOT_VERB = new Set([
  'стол', 'пол', 'угол', 'зал', 'вокзал', 'канал', 'журнал', 'сериал', 'финал', 'бал', 'пенал', 'материал', 'идеал', 'мел', 'отдел', 'предел', 'удел',
  'стул', 'аул', 'гул', 'тыл', 'ил', 'пыл', 'осел', 'котел', 'орел', 'посол', 'футбол', 'баскетбол', 'волейбол', 'кол', 'вол', 'мол', 'пул', 'мул',
  'капитал', 'персонал', 'сигнал', 'овал', 'генерал', 'минерал', 'интервал', 'карнавал', 'подвал', 'провал', 'перевал', 'шакал', 'бокал', 'портал',
  'укол', 'чехол', 'рассол', 'ангел', 'пепел', 'дятел', 'узел', 'пробел', 'мотел', 'престол', 'раскол', 'фингал', 'ритуал', 'арсенал', 'пьедестал',
  'школа', 'дела', 'тела', 'игла', 'пчела', 'стрела', 'скала', 'смола', 'мгла', 'юла', 'сила', 'могила', 'горилла', 'мила', 'ила', 'села', 'весла', 'числа',
])
// краткие прилагательные и сказуемые при «я»
const SHORT_ADJ: [string, string][] = [
  ['рад', 'рада'], ['доволен', 'довольна'], ['готов', 'готова'], ['счастлив', 'счастлива'], ['должен', 'должна'], ['уверен', 'уверена'],
  ['занят', 'занята'], ['свободен', 'свободна'], ['голоден', 'голодна'], ['болен', 'больна'], ['сам', 'сама'], ['спокоен', 'спокойна'], ['влюблён', 'влюблена'],
]
const IRREG: [string, string][] = [
  ['мог', 'могла'], ['смог', 'смогла'], ['помог', 'помогла'], ['лёг', 'легла'], ['лег', 'легла'], ['испёк', 'испекла'], ['замёрз', 'замёрзла'], ['замерз', 'замерзла'],
  ['промок', 'промокла'], ['привык', 'привыкла'], ['продрог', 'продрогла'], ['вышел', 'вышла'], ['зашёл', 'зашла'], ['пришёл', 'пришла'], ['ушёл', 'ушла'],
  ['нашёл', 'нашла'], ['дошёл', 'дошла'], ['пошёл', 'пошла'], ['прошёл', 'прошла'], ['подошёл', 'подошла'], ['обошёл', 'обошла'], ['вошёл', 'вошла'],
  ['перешёл', 'перешла'], ['шёл', 'шла'], ['ел', 'ела'], ['съел', 'съела'], ['сел', 'села'],
]
const toGirl = new Map([...IRREG, ...SHORT_ADJ])
const toBoy = new Map([...IRREG, ...SHORT_ADJ].map(([m, f]) => [f, m]))
const PRONOUN_OTHER = /^(он|она|оно|они|мы|ты|вы|кто-то|все|всё)$/i
/** Непереходные глаголы: после них существительное — их подлежащее («шёл снег», «пришёл папа», «зазвонил будильник»). */
const SUBJECT_AFTER = /^(шел|шёл|шла|шло|шли|пошел|пошёл|пошла|пошло|прошел|прошёл|прошла|пришел|пришёл|пришла|ушел|ушёл|ушла|начал(ся|ась|ось)|закончил(ся|ась|ось)|кончил(ся|ась|ось)|наступил[аио]?|падал[аио]?|выпал[аио]?|зазвонил[аио]?|звонил[аи]?|позвонил[аи]?|приехал[аио]?|уехал[аио]?|был[аио]?|стал[аио]?|светил[аио]?|дул[аио]?|лил[аио]?|горел[аио]?|зажглись|сломал(ся|ась|ось)|опоздал[аио]?|ждал[аио]?)$/
/** Предлоги и наречия после глагола: «пошёл в кино», «пришёл домой» — подлежащего после глагола нет. */
const NOT_SUBJECT = /^(в|во|на|с|со|к|ко|по|из|у|за|до|от|под|над|без|через|про|для|при|о|об|домой|туда|сюда|рано|поздно|быстро|медленно|пешком|вместе|долго|снова|опять|уже|ещё|еще|тоже|сразу|наконец|вдруг|потом|не|и|а|но|как|так|очень|совсем|весь|всю|целый|целую|утром|днём|днем|вечером|ночью)$/

/** Человек по роли в именительном падеже: «позвонила подруга», «пришла мама». */
const PERSON_WORD = /(^|\s)(подруга|подружка|друг|мама|папа|бабушка|дедушка|сестра|брат|тётя|тетя|дядя|учитель|учительница|преподаватель|сосед|соседка|ребёнок|ребенок|малыш|девочка|мальчик|все|кто-то|никто)(\s|$)/
// имена на -л / -ла в начале строки
const NAMES = new Set(['павел', 'михаил', 'даниил', 'гавриил', 'рафаил', 'камила', 'камилла', 'мила', 'алла', 'стелла', 'нелли', 'сабила', 'жамила', 'адиля', 'нурила', 'гуля'])

const isMascPast = (w: string) => /[аяеиоуыё]л(ся)?$/.test(w) && w.length >= 3 && !NOT_VERB.has(w.replace(/ё/g, 'е').replace(/ся$/, ''))
const isFemPast = (w: string) => /[аяеиоуыё]ла(сь)?$/.test(w) && w.length >= 4 && !NOT_VERB.has(w.replace(/ё/g, 'е').replace(/сь$/, ''))

function flip(word: string, hero: Hero): string {
  const m = /^([\p{L}-]+)(.*)$/u.exec(word)
  if (!m) return word
  const [, core, tail] = m
  const low = core.toLowerCase()
  const cap = core !== low
  const back = (w: string) => (cap ? w.charAt(0).toUpperCase() + w.slice(1) : w) + tail
  if (hero === 'girl') {
    const irr = toGirl.get(low)
    if (irr) return back(irr)
    if (isMascPast(low)) return back(low.endsWith('ся') ? `${low.slice(0, -2)}ась` : `${low}а`)
  } else {
    const irr = toBoy.get(low)
    if (irr) return back(irr)
    if (isFemPast(low)) return back(low.endsWith('сь') ? `${low.slice(0, -4)}лся` : low.slice(0, -1))
  }
  return word
}

const LINKS = new Set(['а', 'и', 'но', 'потом', 'затем', 'вдруг', 'тогда', 'наконец', 'сначала', 'утром', 'днём', 'днем', 'вечером', 'ночью', 'уже', 'ещё', 'еще', 'тоже', 'даже', 'снова', 'опять', 'там', 'тут', 'сразу', 'долго', 'потихоньку', 'немного', 'просто', 'не', 'никуда', 'так', 'весь', 'всю', 'в', 'на', 'с', 'что', 'как', 'когда', 'чтобы', 'пока', 'если', 'будто', 'давно', 'очень', 'совсем', 'сам', 'сама'])

/**
 * Род глаголов прошедшего времени (и кратких «рад / рада») у «я» — по герою. Меняется только то, что сказано о себе:
 * часть предложения с «я» или без своего подлежащего («Проснулся, а за окном…»); «она напекла», «бабушка принесла» не трогаем.
 */
export function genderize(line: string, hero: Hero | undefined): string {
  if (!hero) return line
  // части: между запятыми и тире и перед «и / а / но»; разделители сохраняем
  const parts = line.split(/(\s*[,;:—–]\s*|\s+(?=(?:и|а|но)\s))/)
  let selfPrev = true // начало строки без подлежащего — это «я» (дневник)
  let atLineStart = true
  return parts
    .map((part, idx) => {
      if (idx % 2 === 1) return part // разделитель
      const tokens = part.split(/(\s+)/)
      const words = tokens.filter((t) => t.trim()).map((t) => t.replace(/[^\p{L}-]/gu, ''))
      const lows = words.map((w) => w.toLowerCase())
      const lineStart = atLineStart
      atLineStart = false
      const hasI = lows.includes('я')
      // другое подлежащее: местоимение или человек по роли — и после глагола («позвонила подруга»)
      const other = lows.some((w) => PRONOUN_OTHER.test(w)) || (!hasI && PERSON_WORD.test(lows.join(' ')))
      // имя (слово с большой буквы не в начале строки) — своё подлежащее
      const named = words.some((w, i) => /^\p{Lu}/u.test(w) && w !== 'Я' && !(lineStart && i === 0))
      const firstIdx = lows.findIndex((w) => !LINKS.has(w))
      const first = firstIdx >= 0 ? lows[firstIdx] : ''
      // «Утром шёл снег»: у непереходного глагола своё подлежащее сразу после него — это не про автора
      const next = lows[firstIdx + 1] ?? ''
      // подлежащее — в именительном падеже: «снег», «папа», «подруга»; «подруге», «маме», «брату» — дополнение
      const nominative = /[бвгджзклмнпрстфхцчшщйьаяо]$/.test(next) && !/(ом|ем|ой|ей|ам|ям)$/.test(next)
      const ownSubject = !hasI && SUBJECT_AFTER.test(first) && !!next && !NOT_SUBJECT.test(next) && nominative
      const startsWithVerb = !!first && !ownSubject && !NAMES.has(first) && (isMascPast(first) || isFemPast(first) || toGirl.has(first) || toBoy.has(first))
      const self = hasI || (!other && !named && startsWithVerb && selfPrev)
      // своё подлежащее (местоимение, имя или слово перед глаголом: «бабушка напекла») — следующие части без подлежащего про него
      selfPrev = hasI || (self && startsWithVerb) || (selfPrev && !other && !named && !first && !ownSubject)
      if (!self) return part
      let wi = 0
      return tokens
        .map((t) => {
          if (!t.trim()) return t
          const i = wi++
          const w = words[i] ?? ''
          // слова с большой буквы — имена, кроме первого слова строки
          if (/^\p{Lu}/u.test(w) && !(lineStart && i === 0)) return t
          if (NAMES.has(w.toLowerCase())) return t
          return flip(t, hero)
        })
        .join('')
    })
    .join('')
}

/**
 * Род автора по самой записи: глаголы прошедшего времени и краткие «рад / рада» о себе («я устала», «была счастлива»).
 * null — по записи не видно (тогда — выбор героя). Род записи важнее выбора героя: слова автора не переделываем.
 */
export function authorGender(text: string): Hero | null {
  if (!text.trim()) return null
  const tok = (s: string) => s.split(/\s+/)
  const a = tok(text)
  const changed = (h: Hero) => {
    const b = tok(genderize(text, h))
    let n = 0
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) n++
    return n
  }
  // сколько слов о себе в женском роде (их меняет «мальчик») и в мужском (их меняет «девочка»)
  const fem = changed('boy')
  const masc = changed('girl')
  return fem > masc ? 'girl' : masc > fem ? 'boy' : null
}

/** Род для строк рассказа: как пишет о себе автор, иначе — выбор героя. */
export const storyGender = (text: string, hero?: Hero): Hero | undefined => authorGender(text) ?? hero

// ---------- не досочинять ----------

// связки, местоимения и служебные слова: их можно добавлять
const GLUE = new Set(
  ('утром днём днем вечером ночью утра вечера ночи потом затем после сначала снова опять тогда наконец вдруг сегодня вчера завтра ' +
    'ещё еще тоже также очень совсем всего вместе будто словно когда пока чтобы потому поэтому только даже уже сразу почти ' +
    'меня мной себя себе свой своя свои своё свое свою своим наша наши нашу нашим нами него неё нее нему ними этот эта этой этом этого этих этим того тому ' +
    'такой такая такие такую всех всем вся всё все туда сюда оттуда здесь было была были стало стала стали стал будет есть ' +
    'мне нам нас его её ее они она оно мой моя мои это эти тот там тут так как еще ещё уже был для без над под про при или нет нее них ним ней мы вы ты он я ' +
    'этому этими тому чему нему ними ' +
    'день дня днём конце концу итоге потом-то опять-таки вот этот-то который которая которые которую где куда откуда ' +
    'алдымен содан кейін кешке таңертең түсте түнде соңында бүгін және бірақ сосын').split(' '),
)
// чувства и оценки: досочинить их нельзя даже одним словом («и я доволен»)
const FEELING = /^(довол|рад$|рада$|радост|обрад|счаст|весел|груст|печал|уютн|устал|восторг|нрави|понрав|любл|люби|скуча|скучн|обид|злил|страш|боял|испуг|волнов|спокой|хорош|отлич|прекрас|чудес|замечат|классн|круто|лучш|худш|хуже|легч|легк|проще|тяжел|трудн|ужасн|кайф|улыба|смея|смех|плака|слез|слёз)/

/** Глагол прошедшего времени (изменился, разговаривали, горели): новое событие. */
const PAST_VERB = /[аяеиоуыё](л|ла|ло|ли)(ся|сь)?$|(лся|лась|лось|лись)$/

/** Слова строки, которых нет в записи и снимках (кроме связок): что досочинено. */
export function inventedWords(line: string, ref: string): string[] {
  const low = ref.toLowerCase().replace(/ё/g, 'е')
  return line
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}-]+/u)
    .filter((w) => w.length >= 3 && !GLUE.has(w))
    .filter((w) => !low.includes(w.slice(0, Math.max(3, Math.min(5, w.length - 3)))))
}

/**
 * Строка режиссёра → чистая строка или null (тогда запасная): 4–18 слов, без переносов и кавычек по краям;
 * имена (слова с большой буквы не в начале) — только из записи; досочинено не больше одного слова и не чувство
 * («и долго разговаривали», «и я доволен», если этого нет в записи, — нельзя); род «я» — по герою.
 */
export function cleanStory(raw: unknown, text: string, opts: StoryOpts = {}): string | null {
  if (typeof raw !== 'string') return null
  const s = tidy(raw.replace(/[\r\n]+/g, ' '))
  const n = wordsOf(s).length
  if (n < STORY_MIN_WORDS || n > STORY_MAX_WORDS) return null
  const ref = opts.ref ?? text
  const low = ref.toLowerCase().replace(/ё/g, 'е')
  const words = s.split(/\s+/)
  for (let i = 1; i < words.length; i++) {
    const w = words[i].replace(/[^\p{L}-]/gu, '')
    if (!w || !/^\p{Lu}/u.test(w) || /[.!?]$/.test(words[i - 1])) continue
    const stem = w.toLowerCase().replace(/ё/g, 'е').slice(0, Math.max(3, Math.min(5, w.length - 1)))
    if (!low.includes(stem)) return null
  }
  if (ref.trim()) {
    const extra = inventedWords(s, ref)
    // новое чувство или новое действие (глагол прошедшего времени: «и день изменился», «и долго разговаривали») — нельзя
    if (extra.length > 1 || extra.some((w) => FEELING.test(w) || (PAST_VERB.test(w) && !NOT_VERB.has(w)))) return null
  }
  return genderize(upperFirst(s), storyGender(text, opts.hero))
}

/** Что видно на снимках (подпись, место, вещи, люди) — тоже факты дня для проверки строк. */
export function photoRef(cards: readonly (PhotoCard | null)[] | undefined): string[] {
  return (cards ?? []).filter((c): c is PhotoCard => !!c).map((c) => [c.caption, c.place.ru, ...c.things.map((t) => t.ru), ...c.people.map((p) => p.role), c.mood].join(' '))
}

/** Строка для бита снимка без своей фразы (подпись снимка). */
export function photoStory(card: Pick<PhotoCard, 'caption'>, text = ''): string {
  const cap = tidy(card.caption || '')
  if (!cap) return kazakh(text) ? 'Осы күннің суреті де қалды' : 'А ещё в этот день остался снимок'
  return kazakh(text) ? `Суретте: ${cap}` : `А на снимке — ${lowerFirst(cap, text)}`
}

/**
 * Запасные строки: полное предложение бита и связка по порядку. Первая — со времени суток или «Сначала»;
 * смена времени суток — «А вечером»; середина — «Потом» / «А потом»; последняя — «А в конце».
 * Предложение уже со связкой или временем («Вечером поехали…») — как есть. Повтор предложения — его часть с цитатой.
 */
export function fallbackStories(beats: readonly Pick<Beat, 'quote' | 'time_of_day'>[], text: string, heroIn?: Hero): string[] {
  const kk = kazakh(text)
  const hero = storyGender(text, heroIn)
  const opener = kk ? OPENER_KK : OPENER_RU
  const out: string[] = []
  let prevSentence = ''
  beats.forEach((b, i) => {
    const whole = sentenceOf(text, b.quote)
    let s = whole
    // в предложении есть и другие биты — только своя часть: следующий бит расскажет своё сам (одна мысль — один раз)
    const others = beats.filter((o, j) => j !== i && o.quote && whole.includes(o.quote)).map((o) => o.quote)
    if (others.length) s = ownPart(whole, b.quote, others)
    else if (whole === prevSentence) s = clauseOf(whole, b.quote, true)
    else if (wordsOf(whole).length > STORY_MAX_WORDS - 2) s = clauseOf(whole, b.quote)
    prevSentence = whole
    s = tidy(s)
    if (wordsOf(s).length > STORY_MAX_WORDS - 2) s = wordsOf(s).slice(0, STORY_MAX_WORDS - 2).join(' ')
    if (!s) s = tidy(b.quote)
    if (opener.test(s)) {
      out.push(genderize(upperFirst(s), hero))
      return
    }
    const prevTime = i > 0 ? beats[i - 1].time_of_day : undefined
    const time = b.time_of_day
    let link: string
    if (kk) link = i === 0 ? (time ? TIME_KK[time] : 'Алдымен') : time && time !== prevTime ? TIME_KK[time] : i === beats.length - 1 ? 'Соңында' : 'Содан кейін'
    else if (i === 0) link = 'Сначала'
    else if (time && prevTime && time !== prevTime) link = `А ${TIME_RU[time].toLowerCase()}`
    else if (i === beats.length - 1 && beats.length > 2) link = 'А в конце'
    else link = i % 2 ? 'Потом' : 'А потом'
    out.push(genderize(`${link} ${lowerFirst(s, text)}`, hero))
  })
  return out
}

const contentWords = (s: string) =>
  s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/[^\p{L}-]+/u)
    .filter((w) => w.length >= 4 && !GLUE.has(w))

/**
 * Одна мысль — один раз (план 15, сторителлинг): бит уходит, если его мысль уже сказана —
 * цитата целиком входит в строку рассказа прошлого бита («мне было скучно» → следующий бит «скучно»)
 * или два бита-чувства подряд с одной эмоцией. Остаётся не меньше min битов; первый бит не уходит.
 */
export function dropRepeats<B extends Beat>(beats: B[], min = 2, isEmotionOnly: (b: B) => boolean = (b) => b.kind === 'feeling' && !!b.emotion): { beats: B[]; issues: string[] } {
  const issues: string[] = []
  const out: B[] = []
  beats.forEach((b, i) => {
    const prev = out[out.length - 1]
    // убрать можно, только если и без этого бита останется не меньше min
    const canDrop = out.length + (beats.length - i - 1) >= min
    if (prev && canDrop) {
      const told = `${prev.story ?? ''} ${prev.quote}`.toLowerCase().replace(/ё/g, 'е')
      const words = contentWords(b.quote)
      const said = words.length > 0 && words.every((w) => told.includes(w.slice(0, Math.max(4, w.length - 2))))
      const sameFeeling = isEmotionOnly(b) && isEmotionOnly(prev) && b.emotion === prev.emotion
      // та же строка рассказа подряд (режиссёр написал одно и то же к двум битам)
      const norm = (x: string | undefined) => (x ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
      const sameLine = !!b.story && norm(b.story) === norm(prev.story)
      if (said || sameFeeling || sameLine) {
        issues.push(`повтор мысли: бит «${b.quote}» убран (${said ? 'уже сказано в рассказе' : sameLine ? 'та же строка рассказа' : 'та же эмоция подряд'})`)
        return
      }
    }
    out.push(b)
  })
  return { beats: out, issues }
}

/** Строки рассказа для битов: строка режиссёра, если годится, иначе запасная. issues — что заменили. */
export function fillStories<B extends Beat>(beats: B[], text: string, opts: StoryOpts = {}): { beats: B[]; issues: string[] } {
  const issues: string[] = []
  const fb = fallbackStories(beats, text, opts.hero)
  const seen = new Set<string>()
  const out = beats.map((b, i) => {
    let story = cleanStory(b.story, text, opts)
    if (story && seen.has(story.toLowerCase())) story = null
    if (!story) {
      if (b.story !== undefined) issues.push(`строка рассказа бита «${b.quote}» → из предложения`)
      story = fb[i]
    }
    seen.add(story.toLowerCase())
    return { ...b, story }
  })
  return { beats: out, issues }
}
