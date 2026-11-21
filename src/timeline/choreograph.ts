// Хореограф: DayScript → Timeline. Чистая функция, без DOM и без Date/Math.random.
// Структура: вступление ≈ 8 с → блок на каждый бит → (постановка противоречия) → финал ≈ 8 с.
import { resultTags } from '../director/results'
import type { ActionId, Beat, BeatResult, CameraId, DayScript, Mood } from '../types/script'
import type { Timeline, TimelineEvent } from '../types/timeline'
import { makeRng, type Rng } from './rng'

export interface ChoreographOptions {
  seed: number
  /** Удары песни в секундах (от estimateBeats). Начала блоков притягиваются к ним в пределах ±0,4 с. */
  beatTimes?: number[]
  /** Верхняя граница длины фильма, по умолчанию 60 с. */
  maxDuration?: number
  /** Сколько фото у дня. 0 — полароида нет; 1+ — photo_reveal (снимок 0), 2+ — ещё photo_fan с 1. */
  photoCount?: number
}

/** Длительность церемонии полароида и веера остальных снимков. */
export const PHOTO_REVEAL_LEN = 8
export const PHOTO_FAN_LEN = 2.5

export const MIN_DURATION = 30
export const MAX_DURATION = 60
export const INTRO_LEN = 8
export const OUTRO_LEN = 8
const SNAP_WINDOW = 0.4

// Базовые длительности шагов бита (секунды при pace = 1). Сумма ≈ 6 с, как в 06-engine.
const STEP = { lead: 0.2, walk: 1.3, action: 1.0, lift: 0.6, transform: 1.2, reaction: 1.1, gap: 0.6 }

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
  kind: 'beat' | 'contradiction' | 'photo'
  beatIndex: number
  /** Длина блока при pace (до сжатия), включая паузу в конце. */
  len: number
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

/** Куда вставить полароид: после второго бита, при 4 битах и меньше — после первого. */
export function photoAfter(beatCount: number): number {
  return beatCount <= 4 ? 0 : 1
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

export function choreograph(script: DayScript, opts: ChoreographOptions): Timeline {
  const seed = opts.seed >>> 0
  const rng = makeRng(seed)
  const maxDuration = Math.max(MIN_DURATION, opts.maxDuration ?? MAX_DURATION)
  const beatTimes = opts.beatTimes ? [...opts.beatTimes].filter(Number.isFinite).sort((a, b) => a - b) : undefined
  const mood = script.mood
  const pace = computePace(script)
  const beats: Beat[] = script.beats

  // 1. Блоки и их длины.
  const contraAt = contradictionAfter(script)
  const contraLen = script.contradiction ? clamp(2.5 * pace, 2, 3) : 0
  const photos = Math.max(0, Math.floor(opts.photoCount ?? 0))
  const photoAt = photos > 0 && beats.length ? photoAfter(beats.length) : -1
  const photoLen = photos > 0 ? PHOTO_REVEAL_LEN + (photos > 1 ? PHOTO_FAN_LEN : 0) + 0.4 : 0
  const blocks: Block[] = []
  const stepSum = STEP.lead + STEP.walk + STEP.action + STEP.lift + STEP.transform + STEP.reaction + STEP.gap
  beats.forEach((_, i) => {
    blocks.push({ kind: 'beat', beatIndex: i, len: stepSum * pace })
    if (i === contraAt) blocks.push({ kind: 'contradiction', beatIndex: i, len: contraLen + 0.4 })
    if (i === photoAt) blocks.push({ kind: 'photo', beatIndex: i, len: photoLen })
  })

  // 2. Сжать или растянуть биты, чтобы фильм уложился в 30..max.
  const fixed = INTRO_LEN + OUTRO_LEN + (script.contradiction ? contraLen + 0.4 : 0) + photoLen
  const beatSum = blocks.filter((b) => b.kind === 'beat').reduce((s, b) => s + b.len, 0)
  // Запас на притяжение к ударам: каждый блок может сдвинуться не больше чем на окно.
  const snapSlack = beatTimes && beatTimes.length ? SNAP_WINDOW : 0
  const hi = maxDuration - snapSlack - 0.05
  const lo = MIN_DURATION + 0.05
  let scale = 1
  if (beatSum > 0) {
    if (fixed + beatSum > hi) scale = (hi - fixed) / beatSum
    else if (fixed + beatSum < lo) scale = (lo - fixed) / beatSum
  }
  scale = Math.max(0.3, scale)
  for (const b of blocks) if (b.kind === 'beat') b.len *= scale

  const events: TimelineEvent[] = []
  const push = (e: TimelineEvent) => events.push({ ...e, t: r3(e.t), dur: r3(Math.max(0.05, e.dur)) } as TimelineEvent)

  // 3. Вступление.
  push({ type: 'camera', t: 0, dur: 3, beat: -1, shot: 'wide', targetQuote: null })
  push({ type: 'book_open', t: 0.5, dur: 2, beat: -1 })
  push({ type: 'page_flip', t: 2.5, dur: 1, beat: -1 })
  push({ type: 'camera', t: 3, dur: 5, beat: -1, shot: 'push_in', targetQuote: null })
  push({ type: 'actor_enter', t: 4.5, dur: 2.5, beat: -1, actor: 'hero' })

  // 4. Биты.
  let cursor = INTRO_LEN
  let minStart = INTRO_LEN - 0.3
  let prevCam: CameraId | null = 'push_in'
  let secondEntered = false
  const orbitAt = orbitBeat(beats)
  for (const block of blocks) {
    const start = snap(cursor, minStart, beatTimes)
    if (block.kind === 'photo') {
      // Сцена сама ведёт камеру на всём отрезке полароида: никаких camera внутри [start, start + reveal].
      push({ type: 'photo_reveal', t: start, dur: PHOTO_REVEAL_LEN, beat: block.beatIndex, photo: 0 })
      let t = start + PHOTO_REVEAL_LEN
      if (photos > 1) {
        push({ type: 'camera', t, dur: PHOTO_FAN_LEN + 0.4, beat: block.beatIndex, shot: 'wide', targetQuote: null })
        push({ type: 'photo_fan', t, dur: PHOTO_FAN_LEN, beat: block.beatIndex, from: 1 })
        prevCam = 'wide'
        t += PHOTO_FAN_LEN
      } else {
        push({ type: 'camera', t, dur: 0.4, beat: block.beatIndex, shot: 'push_in', targetQuote: null })
        prevCam = 'push_in'
      }
      minStart = t
      cursor = start + block.len
      continue
    }
    if (block.kind === 'contradiction') {
      const c = script.contradiction!
      push({ type: 'camera', t: start, dur: contraLen, beat: block.beatIndex, shot: 'hold', targetQuote: null })
      push({ type: 'staging', t: start, dur: contraLen, beat: block.beatIndex, staging: c.staging })
      prevCam = 'hold'
      minStart = start + contraLen
      cursor = start + block.len
      continue
    }

    const i = block.beatIndex
    const beat = beats[i]
    const k = block.len / stepSum // секунд на единицу шага с учётом pace и сжатия
    const jit = () => 0.94 + rng() * 0.12 // мелкая детерминированная вариативность
    const lead = STEP.lead * k
    const action = beat.action
    let walk = STEP.walk * k * jit()
    let act = action === 'walk' ? 0 : STEP.action * k * jit()
    if (action === 'walk') walk += STEP.action * k
    const lift = STEP.lift * k * jit()
    const transform = STEP.transform * k * jit()
    const reactionAct = chooseReaction(beat.result, action, mood, rng)
    const reaction = STEP.reaction * k * jit()
    const content = lead + walk + act + lift + transform + reaction
    // jitter не должен вылезти за длину блока
    const maxContent = block.len - 0.25 * k
    const fit = content > maxContent ? maxContent / content : 1
    walk *= fit; act *= fit
    const liftD = lift * fit, transD = transform * fit, reactD = reaction * fit, leadD = lead * fit

    const shot: CameraId = i === orbitAt ? 'orbit_quarter' : editCamera(beat.camera, i, prevCam, mood, rng)
    prevCam = shot
    let t = start
    const contentDur = leadD + walk + act + liftD + transD + reactD
    push({ type: 'camera', t, dur: contentDur, beat: i, shot, targetQuote: shot === 'wide' || shot === 'hold' ? null : beat.quote })
    t += leadD
    push({ type: 'actor_walk', t, dur: walk, beat: i, actor: 'hero', toQuote: beat.quote })
    t += walk
    if (act > 0) {
      push({ type: 'actor_action', t, dur: act, beat: i, actor: 'hero', action })
      t += act
    }
    push({ type: 'word_lift', t, dur: liftD, beat: i, quote: beat.quote })
    t += liftD
    const tTransform = t
    push({ type: 'word_transform', t, dur: transD, beat: i, quote: beat.quote, result: beat.result })
    if (beat.result.kind === 'person' && !secondEntered) {
      secondEntered = true
      push({ type: 'actor_enter', t: tTransform + transD * 0.3, dur: Math.min(1.5, transD + reactD), beat: i, actor: 'second' })
    }
    if (beat.effect) {
      push({ type: 'scene_effect', t: tTransform, dur: transD + reactD, beat: i, effect: beat.effect })
    }
    t += transD
    push({ type: 'actor_action', t, dur: reactD, beat: i, actor: 'hero', action: reactionAct })
    t += reactD
    minStart = t
    cursor = start + block.len
  }

  // 5. Финал.
  const o = snap(cursor, minStart, beatTimes)
  push({ type: 'actor_action', t: o, dur: 1.5, beat: -1, actor: 'hero', action: 'sit' })
  push({ type: 'camera', t: o + 1, dur: OUTRO_LEN - 1, beat: -1, shot: 'pull_out', targetQuote: null })
  push({ type: 'book_close', t: o + 1.8, dur: 1.6, beat: -1 })
  push({ type: 'title_reveal', t: o + 3.4, dur: 2.6, beat: -1, title: script.title })
  push({ type: 'to_shelf', t: o + 6, dur: 2, beat: -1 })

  // Стабильная сортировка по t (порядок вставки сохраняется при равных t).
  const sorted = events.map((e, idx) => ({ e, idx })).sort((a, b) => a.e.t - b.e.t || a.idx - b.idx).map((x) => x.e)
  const duration = r3(Math.max(o + OUTRO_LEN, ...sorted.map((e) => e.t + e.dur)))

  return { duration, events: sorted, mood: { ...mood }, pace, seed }
}
