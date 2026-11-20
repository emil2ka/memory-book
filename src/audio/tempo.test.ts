import { describe, expect, it } from 'vitest'
import { estimateBeats, tempoToCategory } from './tempo'

function clickTrack(bpm: number, seconds: number, sr: number, opts: { offset?: number; noise?: number; offbeat?: boolean } = {}) {
  const out = new Float32Array(Math.floor(seconds * sr))
  const period = 60 / bpm
  let seed = 12345
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1
  for (let i = 0; i < out.length; i++) out[i] = (opts.noise ?? 0) * rnd()
  const click = (t: number, amp: number) => {
    const start = Math.floor(t * sr)
    const len = Math.floor(0.03 * sr)
    for (let j = 0; j < len && start + j < out.length; j++) {
      out[start + j] += amp * Math.sin((2 * Math.PI * 1000 * j) / sr) * Math.exp(-j / (0.006 * sr))
    }
  }
  for (let t = opts.offset ?? 0.25; t < seconds; t += period) {
    click(t, 0.8)
    if (opts.offbeat) click(t + period / 2, 0.3)
  }
  return out
}

describe('estimateBeats', () => {
  it('клик-трек 120 bpm → 120 ± 3', () => {
    const sr = 44100
    const r = estimateBeats(clickTrack(120, 20, sr), sr)
    expect(Math.abs(r.bpm - 120)).toBeLessThanOrEqual(3)
    expect(r.beatTimes.length).toBeGreaterThan(30)
    // удары попадают в клики (первый клик на 0,25 с)
    for (const t of r.beatTimes.slice(2, 10)) {
      const k = Math.round((t - 0.25) / 0.5)
      expect(Math.abs(t - (0.25 + k * 0.5))).toBeLessThan(0.03)
    }
  })

  it.each([[90, 22050], [128, 44100], [150, 48000]])('%i bpm при %i Гц, с шумом и слабой долей', (bpm, sr) => {
    const r = estimateBeats(clickTrack(bpm, 25, sr, { noise: 0.02, offbeat: true, offset: 0.4 }), sr)
    expect(Math.abs(r.bpm - bpm)).toBeLessThanOrEqual(3)
  })

  it('тишина и короткий буфер → bpm 0', () => {
    expect(estimateBeats(new Float32Array(44100 * 5), 44100).bpm).toBe(0)
    expect(estimateBeats(new Float32Array(100), 44100)).toEqual({ bpm: 0, beatTimes: [] })
  })

  it('tempoToCategory', () => {
    expect(tempoToCategory(70)).toBe('slow')
    expect(tempoToCategory(120)).toBe('medium')
    expect(tempoToCategory(140)).toBe('fast')
    expect(tempoToCategory(0)).toBe('medium')
  })
})
