// Хореограф: DayScript → Timeline. Чистая функция, без DOM и без Date/Math.random.
// Структура: вступление ≈ 8 с → блок на каждый бит → (постановка противоречия) → финал ≈ 8 с.
import { emotionOnly, normalizeScript } from '../director/beatFields'
import { EMOTION_POSE } from '../director/emotions'
import { matchPhotos, overlap } from '../director/photos'
import { resultTags } from '../director/results'
import { categoryOf } from '../kit/library'
import { sceneRef } from '../kit/sceneCheck'
import { cleanStory, fallbackStories, genderize, photoRef, photoStory } from '../director/story'
import type { ActionId, Beat, BeatResult, BeatWeight, CameraId, DayScript, FullBeat, Mood, PhotoCard } from '../types/script'
import type { BeatWindow, Timeline, TimelineEvent } from '../types/timeline'
import { makeRng, type Rng } from './rng'
import { fadeTime, nearestPhrase, phraseLen, riseTime, type SongShape } from './songShape'

export interface ChoreographOptions {
  seed: number
  /** Удары песни в секундах (от estimateBeats). Начала блоков притягиваются к ним в пределах ±0,4 с. */
  beatTimes?: number[]
  /** Верхняя граница длины фильма, по умолчанию 60 с. */
  maxDuration?: number
  /** Сколько фото у дня. 0 — полароида нет; 1+ — photo_reveal (снимок 0) после первого бита с местом, 2+ — ещё photo_fan с 1 в финале. */
  photoCount?: number
  /**
   * Текст записи дня. Нужен для строк рассказа старых дней (в их сценарии нет Beat.story): тогда строка —
   * полное предложение бита со связкой. Без текста — цитата со связкой.
   */
  text?: string
  /** Герой («он / она»): род «я» в запасных строках рассказа. */
  hero?: 'boy' | 'girl'
  /**
   * Песня дня (план 15, «история под песню»): длина фильма 40–70 с под кусок песни, поворот дня — на подъёме
   * (файл: кривая громкости; YouTube: граница 8-тактовой фразы по bpm), конец — на затухании или на конце фразы.
   */
  song?: SongShape
  /** Внутреннее: второй проход — сдвиг поворота на подъём песни. */
  _turn?: { beat: number; delta: number }
}

/** Длительность церемонии полароида и веера остальных снимков. */
// Роль фото (план 14, А+Б): снимок проявляется в начале своего бита (3 с), из него кубиками собирается сценка;
// не больше 3 снимков с битами, остальные — веером в финале (сцена считает движения от e.dur).
export const PHOTO_REVEAL_LEN = 3
export const PHOTO_FAN_LEN = 2.4
export const MAX_PHOTO_BEATS = 3

// План 13 § 4.6: вход 4 с, первое слово ≤ 5 с, пустоты ≤ 2.5 с. План 15: между битами дорога 1.5–2 с;
// 4 бита ≈ 38 с, 6 ≈ 52 с, 8 ≈ 66 с; больше 75 с не бывает (длинный день сжимается).
export const MIN_DURATION = 24
export const MAX_DURATION = 75
/** Дорога между битами (событие travel): шагом 1.6–2 с по темпу дня, бегом 1.5 с. */
export const TRAVEL_WALK = 1.75
export const TRAVEL_RUN = 1.5
export const TRAVEL_MIN = 1.5
export const TRAVEL_MAX = 2
export const INTRO_LEN = 4
/** Финал: сидит на краю 3.2 с (камера у сцены) → книга закрывается → название → на полку. */
// финал «Поклон» (вещи и люди дня выходят в ряд, человечек проходит вдоль и машет) — ему нужно ~6 с
export const OUTRO_SIT = 5.8
export const OUTRO_LEN = OUTRO_SIT + 5
const SNAP_WINDOW = 0.4

// Базовые длительности шагов бита (секунды при pace = 1). Сумма ≈ 2.8 с; плюс крупный кадр HOLD —
// бит ≈ 5–5.5 с, и перед ним дорога travel 1.5–2 с (план 15: человечек уже пришёл, к слову — короткий подход;
// пауза gap поглощается дорогой, остаётся только перед финалом).
const STEP = { lead: 0.1, walk: 0.4, action: 0.5, lift: 0.4, transform: 0.9, gap: 0.5 }
/** Первый бит: человечек только что вышел из чернил рядом с текстом — короткий подход, без действия, без pace. */
const FIRST = { lead: 0.1, walk: 0.3, lift: 0.4 }
/**
 * Крупный кадр бита (план 13 § 1): поза + полоска с цитатой, 2–3 с по весу фразы. Не сжимается вместе
 * с остальными шагами — это то, ради чего бит.
 */
export const HOLD: Record<BeatWeight, number> = { 1: 2.2, 2: 2.5, 3: 3.0 }
/** Короче крупный кадр не бывает даже в перегруженном дне (сцена: hold ≥ 2.2 с). */
export const HOLD_MIN = 2.2
/** Превращение не короче: второй человечек входит через ≥ 0.3 с после него и до крупного кадра. */
const TRANSFORM_MIN = 0.6
/** Сценка сворачивается в марку и улетает на поле за столько секунд (событие stamp). */
export const STAMP_LEN = 0.6
/** Бит-чувство: подход к человечку 0.3 с, эмоция держится не меньше 2.6 с (это всё, ради чего бит). */
const EMO_LEAD = 0.3
const EMO_HOLD = 2.6
/** Второй человечек появляется после главного предмета (сразу) и места (+0.3 с). */
const COMPANION_DELAY = 0.6

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const r3 = (v: number) => Math.round(v * 1000) / 1000

/** Коэффициент скорости: спокойно ≈ 1,3, напряжённо или быстро ≈ 0,7. */
export function computePace(script: Pick<DayScript, 'mood' | 'song'>): number {
  const m = script.mood
  const tempoTerm = script.song?.tempo === 'fast' ? 0.3 : script.song?.tempo === 'slow' ? -0.3 : 0
  const songEnergy = typeof script.song?.energy === 'number' ? script.song.energy : 0.5
  const score = 0.5 * clamp(m.tension, -1, 1) + 0.3 * clamp(m.energy, -1, 1) + tempoTerm + 0.2 * (songEnergy - 0.5)
  return Math.round(clamp(1 - 0.5 * score, 0.7, 1.3) * 100) / 100
}

/** Реакция человечка после превращения слова. */
export function chooseReaction(result: BeatResult, action: ActionId, mood: Mood, rng: Rng): ActionId {
  let r: ActionId
  if (result.kind === 'kit' || result.kind === 'make') {
    // предмет кита: реакция по тегам и по тому, как его держат
    const { tags, hold } = resultTags(result)
    const has = (...t: string[]) => t.some((x) => tags.includes(x))
    if (has('drink') && hold !== 'ground') r = 'drink'
    else if (has('cold', 'winter') && !has('warm')) r = 'shiver'
    else if (has('joy', 'holiday', 'birthday', 'love', 'gift')) r = 'cheer'
    else if (hold === 'ground') r = 'sit'
    else r = 'carry'
    if (r === action) r = action === 'sit' ? 'cheer' : 'sit'
    return r
  }
  if (result.kind === 'item' && (result.id === 'cocoa' || result.id === 'coffee' || result.id === 'tea')) r = 'drink'
  else if ((result.kind === 'effect' && (result.id === 'frost' || result.id === 'snow' || result.id === 'rain')) ||
    (result.kind === 'item' && result.id === 'snowflake')) r = 'shiver'
  else if (result.kind === 'effect' && result.id === 'sparkles') r = 'cheer'
  else if (result.kind === 'popup') r = 'sit'
  else if (result.kind === 'person') r = mood.warmth >= 0 ? 'cheer' : 'sit'
  else if (result.kind === 'item' && (result.id === 'gift' || result.id === 'cake' || result.id === 'heart' || result.id === 'star')) r = 'cheer'
  else if (result.kind === 'item' || result.kind === 'crystal') r = 'carry'
  else r = rng() < 0.5 + 0.4 * clamp(mood.energy, -1, 1) ? 'cheer' : 'sit'
  // Не повторять то же движение, что было действием бита.
  if (r === action) r = action === 'sit' ? 'cheer' : 'sit'
  return r
}

interface Block {
  kind: 'beat' | 'contradiction'
  beatIndex: number
  /** Длина сжимаемой части блока при pace (до сжатия), включая паузу в конце; у бита — без hold. */
  len: number
  /** Крупный кадр бита (не сжимается); 0 у остальных блоков. */
  hold: number
  /** Первый бит: короткий подход, длина постоянная — не сжимается и не растягивается. */
  first?: boolean
  /** Бит со снимком (индекс фото): снимок 3 с, потом превращение; длина постоянная. */
  photo?: number
  /** Бит-чувство: предмета нет, человечек играет эмоцию; длина постоянная. */
  emotion?: true
}

/**
 * Камера бита после правил монтажа. Первый бит — общий план; в середине фильма общий план редок
 * (человечек на нём мелкий) — вместо него hold, который мягко следит за человечком.
 */
function editCamera(wanted: CameraId, index: number, prev: CameraId | null, mood: Mood, rng: Rng): CameraId {
  if (index === 0) return 'wide'
  let c = wanted
  if (c === 'pull_out') c = 'hold' // pull_out бережём для финала: последний план — отъезд
  if (c === 'wide') c = prev === 'hold' ? 'push_in' : 'hold'
  if (c === 'push_in' && prev === 'push_in') {
    const tense = mood.tension > 0.3
    c = tense ? 'hard_cut' : rng() < 0.5 ? 'orbit_quarter' : 'hold'
  }
  if (c === 'hold' && prev === 'hold') c = 'push_in'
  return c
}

/** Бит для облёта: предмет в руках важнее, чем pop-up; первый бит (общий план) не трогаем. */
function orbitBeat(beats: Beat[]): number {
  let best = -1
  let bestScore = -Infinity
  beats.forEach((b, i) => {
    if (i === 0 && beats.length > 1) return
    if (emotionOnly(b)) return // облёт — вокруг предмета, а у бита-чувства его нет
    const { hold } = resultTags(b.result)
    let score = 0
    if (b.result.kind === 'make' || b.result.kind === 'kit' || b.result.kind === 'item' || b.result.kind === 'crystal') score += 2
    if (hold === 'hand' || hold === 'both') score += 2
    if (b.result.kind === 'effect') score -= 1
    // ближе к середине фильма
    score -= Math.abs(i - (beats.length - 1) / 2) * 0.3
    if (score > bestScore) [best, bestScore] = [i, score]
  })
  return best
}

/** С песней фильм — клип на кусок песни. */
export const SONG_MIN = 40
export const SONG_MAX = 70

/**
 * Поворот дня: бит в середине (не первый — начало, не последний — конец). С подъёмом песни — ближайший к нему,
 * главный бит (вес 3) в приоритете (как будто на 4 с ближе); без подъёма — главный, иначе средний.
 */
export function turnWindow(ws: readonly BeatWindow[], rise: number | null = null): BeatWindow | null {
  if (ws.length < 3) return null
  const mid = ws.slice(1, -1)
  if (rise === null) return mid.find((w) => w.weight === 3) ?? ws[Math.floor(ws.length / 2)]
  // раньше подъёма — лучше (кадры до поворота легко растянуть), позже — вдвое дороже (сжать можно мало)
  const cost = (w: BeatWindow) => (w.start > rise ? 2 : 1) * Math.abs(w.start - rise) - (w.weight === 3 ? 4 : 0)
  return [...mid].sort((a, b) => cost(a) - cost(b))[0]
}

/** Где в песне подъём: по кривой громкости (файл), иначе граница 8-тактовой фразы (bpm), между первым и последним битом. */
function songRise(song: SongShape, ws: readonly BeatWindow[], duration: number, turnStart: number): number | null {
  const lo = ws[1].start
  const hi = ws[ws.length - 1].start
  const r = riseTime(song.energyCurve, lo, Math.min(hi, duration * 0.8))
  if (r !== null) return r
  if (!song.bpm) return null
  // звука YouTube мы не слышим: поворот — на следующую границу 4 тактов (половина фразы; растянуть кадры легче, чем сжать)
  const first = song.beatTimes?.[0] ?? 0
  const bar4 = phraseLen(song.bpm) / 2
  const p = first + Math.ceil((turnStart - first - 0.2) / bar4) * bar4
  return p >= lo && p <= hi ? p : null
}

/** Длина фильма под песню: до затухания (файл) или до конца 8-тактовой фразы (bpm); null — как получится в 40–70 с. */
function songEndTarget(song: SongShape, natural: number, min: number, max: number): number | null {
  const fade = fadeTime(song.energyCurve, min, max)
  if (fade !== null) return fade
  if (!song.bpm) return null
  const p = phraseLen(song.bpm)
  const first = song.beatTimes?.[0] ?? 0
  let end = first + Math.ceil((Math.max(min, natural) - first) / p) * p
  while (end > max && end - p >= min) end -= p
  return end >= min && end <= max ? end : null
}

/** Больше битов при фото — перегружено: оставляем столько (снимки добавляют свои биты). */
export const MAX_BEATS_WITH_PHOTOS = 7

/**
 * Какие биты попадут в фильм. При фото и битах > 5 оставляем 5. Первыми уходят эффекты,
 * потом повтор вида предмета, потом бит с самым коротким словом. Никогда не уходят бит облёта,
 * бит со вторым человечком и бит противоречия. Сценарий не меняется — только таймлайн.
 */
export function keptBeats(beats: Beat[], photos: number, protect: number[]): number[] {
  const all = beats.map((_, i) => i)
  if (photos < 1 || beats.length <= MAX_BEATS_WITH_PHOTOS) return all
  const kind = (b: Beat) => (b.result.kind === 'kit' || b.result.kind === 'item' || b.result.kind === 'popup' ? categoryOf(b.result.id) ?? b.result.id : `${b.result.kind}:${b.result.id}`)
  const keep = new Set(all)
  const safe = (i: number) => protect.includes(i) || beats[i].result.kind === 'person'
  while (keep.size > MAX_BEATS_WITH_PHOTOS) {
    const cand = [...keep].filter((i) => !safe(i))
    if (!cand.length) break
    const rank = (i: number) => {
      const b = beats[i]
      if (b.result.kind === 'effect') return 0
      const k = kind(b)
      if ([...keep].some((j) => j !== i && kind(beats[j]) === k)) return 1
      return 2
    }
    // самый «лишний»: меньший ранг, затем самое короткое слово, затем более поздний бит
    cand.sort((a, c) => rank(a) - rank(c) || beats[a].quote.length - beats[c].quote.length || c - a)
    keep.delete(cand[0])
  }
  return [...keep].sort((a, b) => a - b)
}

/** Куда вставить полароид: после второго бита, при 4 битах и меньше — после первого. */
export function photoAfter(beatCount: number): number {
  return beatCount <= 4 ? 0 : 1
}

/** Бит снимка без пары во фразах: цитата — подпись снимка, главный предмет и место — с фото. */
export function beatFromCard(card: PhotoCard, photo: number): FullBeat {
  const solid = (ref: string) => (ref ? sceneRef(ref) : undefined)
  const thing = card.things.find((t) => (t.where === 'hand' || t.where === 'table') && solid(t.ref)) ?? card.things.find((t) => solid(t.ref)) ?? card.things[0]
  const place = solid(card.place.ref)
  const result: BeatResult = thing && solid(thing.ref) ? { kind: 'kit', id: thing.ref } : place ? { kind: 'kit', id: place.id } : { kind: 'kit', id: 'crystal' }
  const person = card.people[0]
  return {
    quote: card.caption || 'снимок дня',
    action: 'pull',
    result,
    camera: 'hold',
    effect: null,
    hero_prop: thing?.ru || card.place.ru || 'фото',
    place: card.place.ru || null,
    companion: person ? { name: person.role, role: person.role } : null,
    kind: 'photo',
    weight: 2,
    time_of_day: card.time_of_day,
    weather: card.weather,
    photo,
  }
}

export interface PhotoPlan {
  /** Номер бита → индекс снимка (снимок «оживает» в начале этого бита). */
  attach: Map<number, number>
  /** Свои биты снимков без пары: ставятся после бита after. */
  extra: { photo: number; beat: FullBeat; after: number }[]
  /** Снимки без бита — веер в финале. */
  fan: number[]
}

/**
 * Бит со снимком показывает то, что на снимке: место — с фото; главный предмет — свой, если он есть на фото,
 * иначе вещь с фото (сценка и окно бита совпадают со снимком).
 */
export function withCard(b: FullBeat, card: PhotoCard): FullBeat {
  const solid = (ref: string) => (ref ? sceneRef(ref) : undefined)
  const own = (b.result.kind === 'kit' && card.things.some((t) => t.ref === b.result.id)) || card.things.some((t) => overlap(t.ru, b.hero_prop) > 0)
  const thing = card.things.find((t) => (t.where === 'hand' || t.where === 'table') && solid(t.ref)) ?? card.things.find((t) => solid(t.ref))
  const out: FullBeat = { ...b, place: card.place.ru || b.place }
  if (!own && thing) {
    out.hero_prop = thing.ru
    out.result = { kind: 'kit', id: thing.ref }
  }
  return out
}

/**
 * Какие снимки получают биты (не больше MAX_PHOTO_BEATS). Первый бит тоже может получить снимок: его проявляет сцена
 * во время раскрытия книги, без photo_reveal и без сдвига (первое слово ≤ 5 с):
 * 1) бит, который назначил режиссёр (beat.photo);
 * 2) бит, у которого главный предмет и место совпадают с вещами и местом карточки (src/director/photos,
 *    предложение card.match — только запасной признак);
 * 3) карточка есть, пары нет — свой бит kind 'photo' после ближайшего по смыслу бита (или вторым);
 * 4) карточек нет (старый день, без сети) — снимок 0 к первому биту с местом. Остальные — веер.
 */
export function planPhotos(beats: FullBeat[], kept: number[], cards: readonly (PhotoCard | null)[] | undefined, photoCount: number): PhotoPlan {
  const attach = new Map<number, number>()
  const first = kept[0]
  const has = (p: number) => [...attach.values()].includes(p)
  for (const i of kept) {
    const p = beats[i].photo
    if (p === undefined || p === null || p < 0 || p >= photoCount || has(p) || attach.size >= MAX_PHOTO_BEATS) continue
    attach.set(i, p)
  }
  const real = (cards ?? []).slice(0, photoCount)
  if (real.some(Boolean)) {
    const pairs = matchPhotos(beats, real, { candidates: kept.filter((i) => !emotionOnly(beats[i])), takenBeats: [...attach.keys()], takenPhotos: [...attach.values()], max: MAX_PHOTO_BEATS - attach.size })
    for (const [i, p] of pairs) attach.set(i, p)
  }
  const used = new Set(attach.values())
  const extra: PhotoPlan['extra'] = []
  for (let p = 0; p < photoCount && attach.size + extra.length < MAX_PHOTO_BEATS; p++) {
    const card = real[p]
    if (used.has(p) || !card) continue
    const text = [card.caption, card.place.ru, ...card.things.map((t) => t.ru)].join(' ')
    let after = first
    let best = 0
    for (const i of kept) {
      const sc = overlap(text, `${beats[i].quote} ${beats[i].hero_prop} ${beats[i].place ?? ''}`)
      if (sc > best) [best, after] = [sc, i]
    }
    extra.push({ photo: p, beat: beatFromCard(card, p), after })
    used.add(p)
  }
  // старый день без карточек: снимок 0 — к первому биту с местом (не первому)
  if (!real.some(Boolean) && photoCount > 0 && !used.has(0)) {
    const free = kept.filter((i) => i !== first && !attach.has(i) && !emotionOnly(beats[i]))
    const to = free.find((i) => !!beats[i].place) ?? free[0]
    if (to !== undefined) {
      attach.set(to, 0)
      used.add(0)
    }
  }
  return { attach, extra, fan: Array.from({ length: photoCount }, (_, p) => p).filter((p) => !used.has(p)) }
}

/** Где ставить противоречие: после последнего бита, цитата которого перекликается с a или b. */
function contradictionAfter(script: DayScript): number {
  const c = script.contradiction
  if (!c) return -1
  const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3)
  const keys = [...words(c.a), ...words(c.b)].map((w) => w.slice(0, Math.max(3, w.length - 2)))
  let at = -1
  script.beats.forEach((b, i) => {
    const q = b.quote.toLowerCase()
    if (keys.some((k) => q.includes(k))) at = i
  })
  if (at < 0) at = Math.floor((script.beats.length - 1) / 2)
  return at
}

function snap(nominal: number, minStart: number, beatTimes: number[] | undefined): number {
  if (!beatTimes || beatTimes.length === 0) return nominal
  let best = nominal
  let bestD = Infinity
  // beatTimes обычно отсортированы; бинарный поиск не нужен для сотни ударов.
  for (const b of beatTimes) {
    const d = Math.abs(b - nominal)
    if (d <= SNAP_WINDOW && d < bestD && b >= minStart - 1e-9) {
      best = b
      bestD = d
    }
  }
  return best
}

/** Ближайший к nominal удар в окне [lo, hi]; нет — nominal. */
function snapRange(nominal: number, lo: number, hi: number, beatTimes: number[] | undefined): number {
  if (!beatTimes || beatTimes.length === 0) return nominal
  let best = nominal
  let bestD = Infinity
  for (const b of beatTimes) {
    if (b < lo - 1e-9 || b > hi + 1e-9) continue
    const d = Math.abs(b - nominal)
    if (d < bestD) [best, bestD] = [b, d]
  }
  return best
}

export function choreograph(script: DayScript, opts: ChoreographOptions): Timeline {
  const seed = opts.seed >>> 0
  const rng = makeRng(seed)
  // с песней фильм — клип на кусок песни: 40–70 с
  const song = opts.song && (opts.song.bpm || opts.song.beatTimes?.length || opts.song.energyCurve?.length) ? opts.song : null
  const minDuration = song ? SONG_MIN : MIN_DURATION
  const maxDuration = Math.max(minDuration, opts.maxDuration ?? (song ? SONG_MAX : MAX_DURATION))
  const beatTimes = opts.beatTimes ? [...opts.beatTimes].filter(Number.isFinite).sort((a, b) => a - b) : undefined
  const mood = script.mood
  const pace = computePace(script)
  // поля плана 13 (hero_prop, place, companion, kind, weight) — у старых сценариев их выводим из result
  const beats: FullBeat[] = normalizeScript(script).beats

  // 1. Блоки и их длины.
  const contraAt = contradictionAfter(script)
  // противоречие — полноценная картинка (иней и тепло, толпа, усталый шаг при ярком свете): 3.5–4 с
  const contraLen = script.contradiction ? clamp(3.75 * pace, 3.5, 4) : 0
  const photos = Math.max(0, Math.floor(opts.photoCount ?? 0))
  const orbitAt = orbitBeat(beats)
  const kept = keptBeats(beats, photos, [orbitAt, contraAt])
  const stepSum = STEP.lead + STEP.walk + STEP.action + STEP.lift + STEP.transform + STEP.gap
  // первый бит: подход FIRST (без pace) + превращение и пауза в темпе дня
  const firstLen = FIRST.lead + FIRST.walk + FIRST.lift + (STEP.transform + STEP.gap) * pace
  // бит со снимком: снимок проявляется 3 с, потом превращение и пауза в темпе дня
  const photoLen = PHOTO_REVEAL_LEN + (STEP.transform + STEP.gap) * pace
  // снимки (роль фото): к каким битам, свои биты снимков, веер
  const plan = planPhotos(beats, kept, script.photo_cards, photos)
  const all: FullBeat[] = [...beats]
  const makeBlocks = () => {
    all.length = beats.length
    const extraIdx = plan.extra.map((e) => {
      all.push({ ...e.beat })
      return all.length - 1
    })
    const out: Block[] = []
    kept.forEach((i, n) => {
      const hold = HOLD[beats[i].weight]
      const ph = plan.attach.get(i)
      const card = ph !== undefined ? script.photo_cards?.[ph] : null
      if (card) all[i] = withCard(beats[i], card)
      // бит-чувство (без снимка): человечек играет эмоцию, предмета нет
      if (ph === undefined && emotionOnly(beats[i])) out.push({ kind: 'beat', beatIndex: i, len: EMO_LEAD + STEP.gap * pace, hold: Math.max(hold, EMO_HOLD), emotion: true, ...(n === 0 ? { first: true } : {}) })
      // первый бит со снимком: снимок сцена выносит во время раскрытия книги (без photo_reveal и без сдвига)
      else if (n === 0) out.push({ kind: 'beat', beatIndex: i, len: firstLen, hold, first: true, ...(ph !== undefined ? { photo: ph } : {}) })
      else if (ph !== undefined) out.push({ kind: 'beat', beatIndex: i, len: photoLen, hold, photo: ph })
      else out.push({ kind: 'beat', beatIndex: i, len: stepSum * pace, hold })
      if (i === contraAt) out.push({ kind: 'contradiction', beatIndex: i, len: contraLen + 0.4, hold: 0 })
      plan.extra.forEach((e, j) => {
        if (e.after === i) out.push({ kind: 'beat', beatIndex: extraIdx[j], len: photoLen, hold: HOLD[e.beat.weight], photo: e.photo })
      })
    })
    return out
  }
  let blocks = makeBlocks()

  // 2. Сжать или растянуть биты, чтобы фильм уложился в min..max (с песней 40–70 с) (крупные кадры, первый бит и снимки не сжимаются).
  const snapSlack = beatTimes && beatTimes.length ? SNAP_WINDOW : 0
  let hi = maxDuration - snapSlack - 0.05
  let lo = minDuration + 0.05
  // дорога между битами (план 15 § 1.3): бегом, если день быстрый
  const travelMode: 'walk' | 'run' = mood.energy >= 0.4 || script.song?.tempo === 'fast' ? 'run' : 'walk'
  let travelLen = travelMode === 'run' ? TRAVEL_RUN : clamp(TRAVEL_WALK * pace, 1.6, TRAVEL_MAX)
  const travels = (bs: Block[]) => Math.max(0, bs.filter((b) => b.kind === 'beat').length - 1) * travelLen
  const fixedOf = (bs: Block[]) => INTRO_LEN + OUTRO_LEN + travels(bs) + bs.reduce((sum, b) => sum + (b.kind === 'contradiction' || b.first || b.photo !== undefined || b.emotion ? b.len : 0) + b.hold, 0)
  const scalable = (bs: Block[]) => bs.filter((b) => b.kind === 'beat' && !b.first && b.photo === undefined && !b.emotion)
  // конец — на затухании песни (файл) или на конце 8-тактовой фразы (известный bpm)
  const songEnd = song ? songEndTarget(song, fixedOf(blocks) + scalable(blocks).reduce((x, b) => x + b.len, 0), minDuration, maxDuration) : null
  if (songEnd) {
    hi = Math.min(hi, songEnd + 0.4)
    lo = Math.max(lo, songEnd - 1.2)
  }
  // даже в самом сжатом виде не влезает — свои биты снимков уходят в веер (с конца)
  while (plan.extra.length && fixedOf(blocks) - blocks.reduce((sum, b) => sum + b.hold, 0) + blocks.filter((b) => b.hold).length * HOLD_MIN + 0.3 * scalable(blocks).reduce((sum, b) => sum + b.len, 0) > hi) {
    const e = plan.extra.pop()!
    plan.fan.push(e.photo)
    plan.fan.sort((x, y) => x - y)
    blocks = makeBlocks()
  }
  const holdSum = blocks.reduce((sum, b) => sum + b.hold, 0)
  const fixed = fixedOf(blocks)
  const beatSum = scalable(blocks).reduce((sum, b) => sum + b.len, 0)
  let scale = 1
  if (beatSum > 0) {
    if (fixed + beatSum > hi) scale = (hi - fixed) / beatSum
    else if (fixed + beatSum < lo) scale = (lo - fixed) / beatSum
  }
  scale = Math.max(0.3, scale)
  for (const b of scalable(blocks)) b.len *= scale
  // битов слишком много даже для сжатых шагов — тогда короче и крупные кадры (не короче HOLD_MIN)
  const over = fixed + beatSum * scale - hi
  if (over > 0 && holdSum > 0) {
    const hk = 1 - over / holdSum
    for (const b of blocks) if (b.hold) b.hold = Math.max(HOLD_MIN, b.hold * hk)
  }
  // и этого мало — дорога короче (не короче TRAVEL_MIN); дальше предел мягкий: фильм длиннее, но не рваный
  const nTravel = Math.max(0, blocks.filter((b) => b.kind === 'beat').length - 1)
  const over2 = fixedOf(blocks) + beatSum * scale - hi
  if (over2 > 0 && nTravel) travelLen = Math.max(TRAVEL_MIN, travelLen - over2 / nTravel)
  // второй проход: поворот дня — на подъём песни. До поворота биты длиннее (крупный кадр) или короче (шаги),
  // после — наоборот, чтобы длина фильма осталась под песню
  if (opts._turn) {
    const at = blocks.findIndex((b) => b.kind === 'beat' && b.beatIndex === opts._turn!.beat)
    const pre = blocks.slice(0, at).filter((b) => b.kind === 'beat')
    const post = blocks.slice(at + 1).filter((b) => b.kind === 'beat')
    const shiftBy = (bs: Block[], d: number) => {
      if (!bs.length || !d) return
      // до поворота один бит (тихое начало песни) — его крупный кадр может держаться дольше
      const cap = HOLD[3] + (bs.length === 1 ? 3 : 2)
      for (const b of bs) {
        const each = d / bs.length
        if (each > 0) {
          // длиннее: сначала крупный кадр (до cap), остаток — шаги бита (до ×1.5)
          const add = Math.min(each, cap - b.hold)
          b.hold += Math.max(0, add)
          const rest = each - Math.max(0, add)
          if (rest > 0 && scalable([b]).length) b.len = Math.min(b.len * 1.5, b.len + rest)
        } else {
          const k = scalable([b]).length ? Math.max(0.6, 1 + each / Math.max(0.1, b.len)) : 1
          const fromLen = b.len * (1 - k)
          b.len *= k
          b.hold = Math.max(HOLD_MIN, b.hold + Math.min(0, each + fromLen))
        }
      }
    }
    if (at > 0) {
      shiftBy(pre, opts._turn.delta)
      shiftBy(post, -opts._turn.delta)
    }
  }

  const events: TimelineEvent[] = []
  const windows: BeatWindow[] = []
  const push = (e: TimelineEvent) => events.push({ ...e, t: r3(e.t), dur: r3(Math.max(0.05, e.dur)) } as TimelineEvent)

  // 3. Вступление.
  // книга раскрыта, текст дня на странице; из чернил выбирается человечек (план 13 § 1: 0–4 с)
  // book_open ≥ 1.2 с, actor_enter ≥ 1.6 с (короче — подтягивание рывком), наезд — вместе с выходом человечка
  push({ type: 'camera', t: 0, dur: 2.0, beat: -1, shot: 'wide', targetQuote: null })
  push({ type: 'book_open', t: 0.2, dur: 1.5, beat: -1 })
  push({ type: 'camera', t: 2.0, dur: 2.0, beat: -1, shot: 'push_in', targetQuote: null })
  push({ type: 'actor_enter', t: 2.0, dur: 2.0, beat: -1, actor: 'hero' })

  // строки рассказа по порядку фильма: строка режиссёра (Beat.story), иначе — предложение бита со связкой;
  // бит снимка без фразы — подпись снимка
  const order = blocks.filter((b) => b.kind === 'beat').map((b) => b.beatIndex)
  const text = opts.text ?? ''
  const fbStories = fallbackStories(order.map((i) => all[i]), text, opts.hero)
  const ref = [text, ...photoRef(script.photo_cards)].join('\n')
  const storyOf = new Map<number, string>()
  order.forEach((i, n) => {
    const b = all[i]
    const own = b.story?.trim() ? (text ? cleanStory(b.story, text, { hero: opts.hero, ref }) : genderize(b.story.trim(), opts.hero)) : null
    // (род: как пишет о себе автор записи, иначе выбор героя — внутри cleanStory)
    const card = i >= beats.length && b.photo !== undefined && b.photo !== null ? script.photo_cards?.[b.photo] : null
    storyOf.set(i, own ?? (card ? photoStory(card, text) : fbStories[n]))
  })

  // 4. Биты.
  let cursor = INTRO_LEN
  // когда освободился прошлый блок (конец крупного кадра бита или конец противоречия) и какой бит был последним
  let freeAt = INTRO_LEN
  let lastBeat = -1
  let minStart = INTRO_LEN - 0.3
  let prevCam: CameraId | null = 'push_in'
  let secondEntered = false
  // первый бит — сразу после входа, без притяжения к удару (первое слово ≤ 5 с)
  let firstBeat = true
  for (const [bi, block] of blocks.entries()) {
    // дорога от прошлого бита: человечек уходит из сценки (она складывается в марку за спиной) и идёт к новой;
    // новая начинается не раньше, чем он дошёл
    const travel = block.kind === 'beat' && lastBeat >= 0
    if (travel) {
      // дорога может стать короче (до TRAVEL_MIN) или длиннее (до TRAVEL_MAX), чтобы сценка встала на удар песни
      cursor = freeAt + travelLen
      minStart = Math.max(minStart, freeAt + TRAVEL_MIN)
    }
    // после дороги удар ищем во всём окне [дорога 1.5 с, max(дорога + 0.4 с, 2 с)]: начало сценки ложится на удар даже при быстрой дороге
    const start = block.kind === 'beat' && firstBeat ? cursor : travel ? snapRange(cursor, minStart, Math.max(cursor + SNAP_WINDOW, freeAt + TRAVEL_MAX), beatTimes) : snap(cursor, minStart, beatTimes)
    if (travel) push({ type: 'travel', t: freeAt, dur: Math.min(TRAVEL_MAX, start - freeAt), beat: lastBeat, from: lastBeat, to: block.beatIndex, mode: travelMode })
    if (block.kind === 'contradiction') {
      const c = script.contradiction!
      push({ type: 'camera', t: start, dur: contraLen, beat: block.beatIndex, shot: 'hold', targetQuote: null })
      push({ type: 'staging', t: start, dur: contraLen, beat: block.beatIndex, staging: c.staging })
      prevCam = 'hold'
      minStart = start + contraLen
      cursor = start + block.len
      freeAt = start + contraLen
      continue
    }

    const i = block.beatIndex
    const beat = all[i]
    const photo = block.photo
    if (block.emotion) {
      // бит-чувство: слово не превращается — человечек играет эмоцию, рассказ её называет; сценки и марки нет
      firstBeat = false
      const reactD = block.hold
      const tHold = start + EMO_LEAD
      const emotion = beat.emotion!
      prevCam = 'hold'
      push({ type: 'camera', t: start, dur: EMO_LEAD + reactD, beat: i, shot: 'hold', targetQuote: null })
      push({ type: 'actor_action', t: tHold, dur: reactD, beat: i, actor: 'hero', action: EMOTION_POSE[emotion] ?? 'sit', emotion })
      push({ type: 'quote_caption', t: tHold, dur: reactD, beat: i, quote: beat.quote })
      if (beat.companion) push({ type: 'companion_enter', t: tHold, dur: 1, beat: i, companion: beat.companion })
      if (beat.effect) push({ type: 'scene_effect', t: tHold, dur: reactD, beat: i, effect: beat.effect })
      const tEnd = tHold + reactD
      windows.push({
        beat: i,
        quote: beat.quote,
        start: r3(start),
        transform: r3(tHold),
        hold: [r3(tHold), r3(tEnd)],
        end: r3(tEnd),
        hero_prop: beat.hero_prop,
        place: beat.place,
        companion: beat.companion,
        kind: beat.kind,
        weight: beat.weight,
        time_of_day: beat.time_of_day,
        weather: beat.weather,
        photo: null,
        photo_card: null,
        story: storyOf.get(i) ?? beat.quote,
        emotion,
      })
      minStart = tEnd
      cursor = start + block.len + block.hold
      freeAt = tEnd
      lastBeat = i
      continue
    }
    const k = block.first || photo !== undefined ? pace : block.len / stepSum // секунд на единицу шага с учётом pace и сжатия
    const jit = () => 0.94 + rng() * 0.12 // мелкая детерминированная вариативность
    const first = !!block.first
    firstBeat = false
    const reactionAct = chooseReaction(beat.result, beat.action, mood, rng)
    // крупный кадр: поза и цитата — не сжимается
    const reactD = block.hold
    let t = start
    let tTransform: number
    let transD: number
    if (photo !== undefined && !first) {
      // снимок бита: полароид выходит из книги и проявляется (камерой ведёт сцена), потом из него — кубики сценки
      push({ type: 'photo_reveal', t, dur: PHOTO_REVEAL_LEN, beat: i, photo })
      t += PHOTO_REVEAL_LEN
      transD = Math.max(TRANSFORM_MIN, STEP.transform * pace)
      prevCam = 'hold'
      push({ type: 'camera', t, dur: transD + reactD, beat: i, shot: 'hold', targetQuote: null })
      tTransform = t
    } else {
      const lead = first ? FIRST.lead : STEP.lead * k
      const action = beat.action
      let walk = first ? FIRST.walk : STEP.walk * k * jit()
      let act = first || action === 'walk' ? 0 : STEP.action * k * jit()
      if (action === 'walk' && !first) walk += STEP.action * k
      const lift = first ? FIRST.lift : STEP.lift * k * jit()
      const transform = STEP.transform * k * jit()
      const content = lead + walk + act + lift + transform
      // jitter не должен вылезти за длину блока
      const maxContent = block.len - 0.25 * k
      const fit = content > maxContent ? maxContent / content : 1
      walk *= fit
      act *= fit
      const liftD = lift * fit
      const leadD = lead * fit
      transD = Math.max(TRANSFORM_MIN, transform * fit)
      const shot: CameraId = i === orbitAt ? 'orbit_quarter' : editCamera(beat.camera, kept.indexOf(i), prevCam, mood, rng)
      prevCam = shot
      push({ type: 'camera', t, dur: leadD + walk + act + liftD + transD + reactD, beat: i, shot, targetQuote: shot === 'wide' || shot === 'hold' ? null : beat.quote })
      t += leadD
      push({ type: 'actor_walk', t, dur: walk, beat: i, actor: 'hero', toQuote: beat.quote })
      t += walk
      if (act > 0) {
        push({ type: 'actor_action', t, dur: act, beat: i, actor: 'hero', action })
        t += act
      }
      push({ type: 'word_lift', t, dur: liftD, beat: i, quote: beat.quote })
      t += liftD
      tTransform = t
    }
    push({ type: 'word_transform', t, dur: transD, beat: i, quote: beat.quote, result: beat.result })
    if (beat.result.kind === 'person' && !secondEntered) {
      secondEntered = true
      push({ type: 'actor_enter', t: tTransform + transD * 0.3, dur: Math.min(1.5, transD + reactD), beat: i, actor: 'second' })
    }
    // человек из фразы: после главного предмета (≥ transform + 0.3 с) и до крупного кадра (hold[0] = transform + transD)
    if (beat.companion) {
      push({ type: 'companion_enter', t: tTransform + Math.min(COMPANION_DELAY, transD - 0.1), dur: 1, beat: i, companion: beat.companion })
    }
    if (beat.effect) {
      push({ type: 'scene_effect', t: tTransform, dur: transD + reactD, beat: i, effect: beat.effect })
    }
    t += transD
    const tHold = t
    // поза крупного кадра: реакция каталога (запасная) и эмоция бита (её играет новая сцена)
    push({ type: 'actor_action', t, dur: reactD, beat: i, actor: 'hero', action: reactionAct, ...(beat.emotion ? { emotion: beat.emotion } : {}), ...(beat.act ? { act: beat.act } : {}) })
    push({ type: 'quote_caption', t, dur: reactD, beat: i, quote: beat.quote })
    t += reactD
    // сценка сворачивается в марку; сворачивание идёт в паузе перед следующим битом
    // за ним дорога — марка складывается целиком, пока человечек уходит
    const gapD = blocks[bi + 1]?.kind === 'beat' ? STAMP_LEN : start + block.len + block.hold - t
    push({ type: 'stamp', t, dur: Math.min(STAMP_LEN, Math.max(0.3, gapD)), beat: i, quote: beat.quote })
    windows.push({
      beat: i,
      quote: beat.quote,
      start: r3(start),
      transform: r3(tTransform),
      hold: [r3(tHold), r3(t)],
      end: r3(t),
      hero_prop: beat.hero_prop,
      place: beat.place,
      companion: beat.companion,
      kind: beat.kind,
      weight: beat.weight,
      time_of_day: beat.time_of_day,
      weather: beat.weather,
      photo: photo ?? null,
      photo_card: photo !== undefined ? (script.photo_cards?.[photo] ?? null) : null,
      story: storyOf.get(i) ?? beat.quote,
      ...(beat.emotion ? { emotion: beat.emotion } : {}),
      ...(beat.act ? { act: beat.act } : {}),
    })
    minStart = t
    cursor = start + block.len + block.hold
    freeAt = t
    lastBeat = i
  }

  // 5. Финал.
  const o = snap(cursor, minStart, beatTimes)
  // человечек идёт к краю правой страницы, садится, болтает ногами, машет и ныряет в книгу:
  // на [o, o + OUTRO_SIT] камерой управляет сцена — событий camera там нет
  // с песней конец — на её затухании / конце фразы: недостающее человечек досиживает на краю (до +5 с)
  const sit = OUTRO_SIT + (songEnd ? clamp(songEnd - (o + OUTRO_LEN), 0, 5) : 0)
  push({ type: 'actor_action', t: o, dur: sit, beat: -1, actor: 'hero', action: 'sit' })
  // остальные снимки дня веером — в финале, пока человечек сидит (камерой ведёт сцена)
  if (plan.fan.length) push({ type: 'photo_fan', t: o, dur: Math.min(PHOTO_FAN_LEN, sit), beat: -1, from: Math.min(...plan.fan), photos: plan.fan })
  push({ type: 'camera', t: o + sit, dur: OUTRO_LEN - OUTRO_SIT, beat: -1, shot: 'pull_out', targetQuote: null })
  push({ type: 'book_close', t: o + sit, dur: 1.4, beat: -1 })
  push({ type: 'title_reveal', t: o + sit + 1.4, dur: 2.0, beat: -1, title: script.title })
  push({ type: 'to_shelf', t: o + sit + 3.2, dur: 1.8, beat: -1 })

  // Стабильная сортировка по t (порядок вставки сохраняется при равных t).
  const sorted = events.map((e, idx) => ({ e, idx })).sort((a, b) => a.e.t - b.e.t || a.idx - b.idx).map((x) => x.e)
  const duration = r3(Math.max(o + sit + OUTRO_LEN - OUTRO_SIT, ...sorted.map((e) => e.t + e.dur)))

  // поворот дня — на подъём песни: второй проход со сдвигом (только один раз)
  let turnBeat: number | undefined = opts._turn && opts._turn.beat >= 0 ? opts._turn.beat : undefined
  if (song && !opts._turn && windows.length >= 3) {
    // подъём по кривой (файл) — точка во времени; по bpm — граница фразы рядом с поворотом
    const fixedRise = riseTime(song.energyCurve, windows[1].start, Math.min(windows[windows.length - 1].start, duration * 0.8))
    const turn = turnWindow(windows, fixedRise)
    const rise = turn ? (fixedRise ?? songRise(song, windows, duration, turn.start)) : null
    if (turn && rise !== null) {
      const delta = Math.max(-8, Math.min(8, rise - turn.start))
      if (Math.abs(delta) > 0.4) return choreograph(script, { ...opts, _turn: { beat: turn.beat, delta } })
      turnBeat = turn.beat
    }
  }

  return { duration, events: sorted, beats: windows, mood: { ...mood }, pace, seed, ...(turnBeat !== undefined ? { turn: turnBeat } : {}) }
}
