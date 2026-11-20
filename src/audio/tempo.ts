// Оценка темпа и ударов по сырым сэмплам (моно). Без DOM: работает в браузере и в node.
// Метод: огибающая энергии → onset-кривая (рост лог-энергии) → автокорреляция → период;
// фаза — по сумме onset-кривой на сетке ударов; каждый удар уточняется по локальному максимуму.
import type { Tempo } from '../types/script'

export interface BeatEstimate {
  bpm: number
  /** Удары, секунды от начала сэмплов. Пустой, если темп не найден. */
  beatTimes: number[]
}

const MIN_BPM = 60
const MAX_BPM = 200

export function estimateBeats(samples: Float32Array, sampleRate: number): BeatEstimate {
  if (!samples || samples.length < sampleRate * 2 || !(sampleRate > 0)) return { bpm: 0, beatTimes: [] }

  // 1. Огибающая: RMS окнами по ~5,8 мс.
  const hop = Math.max(1, Math.round(sampleRate / 172.265625)) // 256 при 44,1 кГц
  const hopSec = hop / sampleRate
  const win = hop * 2
  const frames = Math.floor((samples.length - win) / hop)
  if (frames < 64) return { bpm: 0, beatTimes: [] }
  const energy = new Float32Array(frames)
  for (let f = 0; f < frames; f++) {
    let s = 0
    const o = f * hop
    for (let i = 0; i < win; i++) {
      const v = samples[o + i]
      s += v * v
    }
    energy[f] = Math.log1p(1000 * Math.sqrt(s / win))
  }

  // 2. Onset: положительный прирост, минус скользящее среднее (~0,3 с).
  const onset = new Float32Array(frames)
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, energy[f] - energy[f - 1])
  const avgW = Math.max(1, Math.round(0.15 / hopSec))
  const prefix = new Float64Array(frames + 1)
  for (let f = 0; f < frames; f++) prefix[f + 1] = prefix[f] + onset[f]
  const env = new Float32Array(frames)
  let envMax = 0
  for (let f = 0; f < frames; f++) {
    const a = Math.max(0, f - avgW)
    const b = Math.min(frames, f + avgW + 1)
    const mean = (prefix[b] - prefix[a]) / (b - a)
    env[f] = Math.max(0, onset[f] - mean)
    if (env[f] > envMax) envMax = env[f]
  }
  if (envMax <= 1e-6) return { bpm: 0, beatTimes: [] }

  // 3. Автокорреляция в диапазоне 60..200 bpm с мягким приоритетом около 120 bpm.
  const minLag = Math.floor(60 / MAX_BPM / hopSec)
  const maxLag = Math.min(frames - 1, Math.ceil(60 / MIN_BPM / hopSec))
  const ac = new Float64Array(maxLag + 2)
  for (let lag = minLag; lag <= maxLag + 1 && lag < frames; lag++) {
    let s = 0
    for (let f = lag; f < frames; f++) s += env[f] * env[f - lag]
    ac[lag] = s / (frames - lag)
  }
  let bestLag = -1
  let bestScore = -Infinity
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (!(ac[lag] >= ac[lag - 1] && ac[lag] >= ac[lag + 1])) continue
    const bpm = 60 / (lag * hopSec)
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.9, 2))
    const score = ac[lag] * prior
    if (score > bestScore) {
      bestScore = score
      bestLag = lag
    }
  }
  if (bestLag < 0) return { bpm: 0, beatTimes: [] }
  // Параболическое уточнение пика.
  const y0 = ac[bestLag - 1], y1 = ac[bestLag], y2 = ac[bestLag + 1]
  const denom = y0 - 2 * y1 + y2
  const lagF = bestLag + (denom !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / denom)) : 0)
  let period = lagF // в кадрах

  // 4. Фаза: сдвиг, при котором сумма огибающей на сетке ударов максимальна.
  const sample = (x: number) => {
    const i = Math.floor(x)
    if (i < 0 || i + 1 >= frames) return 0
    const fr = x - i
    return env[i] * (1 - fr) + env[i + 1] * fr
  }
  let bestPhase = 0
  let bestSum = -Infinity
  const steps = Math.max(8, Math.ceil(period))
  for (let k = 0; k < steps; k++) {
    const ph = (k / steps) * period
    let s = 0
    for (let x = ph; x < frames; x += period) s += Math.max(sample(x - 1), sample(x), sample(x + 1))
    if (s > bestSum) {
      bestSum = s
      bestPhase = ph
    }
  }

  // 5. Удары: сетка, каждый удар притягивается к локальному максимуму (±15% периода).
  const radius = Math.max(1, Math.round(period * 0.15))
  const refined: number[] = []
  for (let x = bestPhase; x < frames; x += period) {
    const c = Math.round(x)
    let bi = c
    let bv = -1
    for (let i = Math.max(0, c - radius); i <= Math.min(frames - 1, c + radius); i++) {
      if (env[i] > bv) {
        bv = env[i]
        bi = i
      }
    }
    refined.push(bv > envMax * 0.1 ? bi : x)
  }

  // 6. Период по линейной регрессии позиций ударов — точнее одного пика автокорреляции.
  if (refined.length >= 4) {
    const n = refined.length
    let sx = 0, sy = 0, sxx = 0, sxy = 0
    for (let i = 0; i < n; i++) {
      sx += i; sy += refined[i]; sxx += i * i; sxy += i * refined[i]
    }
    const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx)
    if (slope > 0 && Math.abs(slope - period) / period < 0.05) period = slope
  }

  // Кадр f соответствует окну [f*hop, f*hop+win]; onset кадра — его центр ≈ (f + 1) * hop.
  const beatTimes = refined.map((f) => Math.round((f + 1) * hopSec * 1000) / 1000)
  const bpm = Math.round((60 / (period * hopSec)) * 10) / 10
  return { bpm, beatTimes }
}

/** Темп для сценария: медленно < 90 ≤ средне < 125 ≤ быстро. */
export function tempoToCategory(bpm: number): Tempo {
  if (!(bpm > 0)) return 'medium'
  if (bpm < 90) return 'slow'
  if (bpm < 125) return 'medium'
  return 'fast'
}

/** Сведение многоканального буфера в моно (например, из AudioBuffer). */
export function toMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]
  const n = Math.min(...channels.map((c) => c.length))
  const out = new Float32Array(n)
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length
  return out
}
