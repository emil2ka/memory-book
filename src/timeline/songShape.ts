// Форма песни для хореографа (план 15, «история под песню»): где в песне подъём (поворот дня ложится туда),
// где затухание (конец фильма), где границы фраз по 8 тактов. Чистые функции, без DOM.
//   файл — кривая громкости из анализа (energyCurve) и доли (beatTimes);
//   YouTube из списка — только bpm: подъём = граница 8-тактовой фразы (часто там припев), звука мы не слышим.

/** Что хореограф знает о песне дня. */
export interface SongShape {
  /** Темп: измеренный по файлу или известный (список песен). */
  bpm?: number
  /** Доли, секунды от начала песни. */
  beatTimes?: number[]
  /** Громкость по секундам 0..1 (файл, анализ). */
  energyCurve?: number[]
  /** Длина трека, с. */
  duration?: number
}

/** Громкость по окнам sec секунд, 0..1 (к максимуму трека). */
export function energyCurve(samples: Float32Array, sampleRate: number, sec = 1): number[] {
  const win = Math.max(1, Math.round(sampleRate * sec))
  const out: number[] = []
  for (let o = 0; o + win <= samples.length; o += win) {
    let s = 0
    for (let i = o; i < o + win; i += 8) s += samples[i] * samples[i]
    out.push(Math.sqrt(s / (win / 8)))
  }
  const max = Math.max(1e-6, ...out)
  return out.map((v) => Math.round((v / max) * 100) / 100)
}

const smooth = (c: number[], r = 2) => c.map((_, i) => {
  let s = 0
  let n = 0
  for (let j = Math.max(0, i - r); j <= Math.min(c.length - 1, i + r); j++) {
    s += c[j]
    n++
  }
  return s / n
})

/**
 * Подъём: секунда в [from, to], где громкость сильнее всего растёт (среднее 4 с после минус 4 с до).
 * null — подъёма нет (рост меньше 0.08) или кривой мало.
 */
export function riseTime(curve: readonly number[] | undefined, from: number, to: number): number | null {
  if (!curve || curve.length < 12) return null
  const c = smooth([...curve], 1)
  const avg = (a: number, b: number) => {
    const xs = c.slice(Math.max(0, a), Math.max(0, b))
    return xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 0
  }
  let best: number | null = null
  let gain = 0.08
  for (let t = Math.max(4, Math.ceil(from)); t <= Math.min(c.length - 4, Math.floor(to)); t++) {
    const g = avg(t, t + 4) - avg(t - 4, t)
    if (g > gain) [best, gain] = [t, g]
  }
  return best
}

/** Затухание: первая секунда в [from, to], после которой 3 с громкость ниже 60 % от средней до неё; null — нет. */
export function fadeTime(curve: readonly number[] | undefined, from: number, to: number): number | null {
  if (!curve || curve.length < 12) return null
  const c = smooth([...curve], 1)
  for (let t = Math.max(8, Math.ceil(from)); t <= Math.min(c.length - 3, Math.floor(to)); t++) {
    const before = c.slice(0, t).reduce((x, y) => x + y, 0) / t
    if (c.slice(t, t + 3).every((v) => v < before * 0.6)) return t
  }
  return null
}

/** Длина 8-тактовой фразы (4/4), с. */
export const phraseLen = (bpm: number) => (8 * 4 * 60) / bpm

/** Граница фразы, ближайшая к t (от первой доли, если она известна). */
export function nearestPhrase(t: number, bpm: number, firstBeat = 0): number {
  const p = phraseLen(bpm)
  return firstBeat + Math.max(1, Math.round((t - firstBeat) / p)) * p
}

/** Слово о характере песни для «Почему так» и промпта. */
export function songFeel(bpm: number | undefined, energy: number | undefined): 'slow' | 'medium' | 'fast' {
  const e = energy ?? 0.5
  if ((bpm && bpm < 90) || (!bpm && e < 0.4)) return 'slow'
  if ((bpm && bpm >= 120 && e >= 0.45) || (!bpm && e > 0.66)) return 'fast'
  return 'medium'
}
