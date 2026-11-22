import { describe, expect, it } from 'vitest'
import { choreograph, SONG_MAX, SONG_MIN } from './choreograph'
import { fadeTime, nearestPhrase, phraseLen, riseTime } from './songShape'
import { exemplars } from '../director/exemplars'

const grid = (bpm: number, from = 0.3) => Array.from({ length: 400 }, (_, i) => from + (i * 60) / bpm)
// громкость по секундам: тихо до rise, громко до fade, потом тихо
const curve = (rise: number, fade: number, len = 90) => Array.from({ length: len }, (_, t) => (t < rise ? 0.3 : t < fade ? 0.9 : 0.15))

describe('история под песню', () => {
  it('подъём и затухание по кривой громкости, фраза по bpm', () => {
    expect(riseTime(curve(24, 60), 8, 50)).toBeGreaterThanOrEqual(22)
    expect(riseTime(curve(24, 60), 8, 50)).toBeLessThanOrEqual(26)
    expect(fadeTime(curve(24, 52), 40, 70)).toBeGreaterThanOrEqual(51)
    expect(phraseLen(120)).toBe(16)
    expect(nearestPhrase(30, 120, 0.3)).toBeCloseTo(32.3, 5)
  })

  it('файл: фильм 40–70 с, поворот дня — на подъёме песни, конец — на затухании', () => {
    for (const e of exemplars) {
      const song = { bpm: 120, beatTimes: grid(120), energyCurve: curve(22, 54), duration: 180 }
      const tl = choreograph(e.script, { seed: 1, beatTimes: song.beatTimes, song })
      expect(tl.duration).toBeGreaterThanOrEqual(SONG_MIN)
      expect(tl.duration).toBeLessThanOrEqual(SONG_MAX)
      const turn = tl.beats.find((w) => w.beat === tl.turn)!
      expect(turn).toBeTruthy()
      expect(Math.abs(turn.start - 22)).toBeLessThan(2.5)
      expect(Math.abs(tl.duration - 54)).toBeLessThan(3)
    }
  })

  it('YouTube (только bpm): поворот — на границе 4 тактов, длина — до конца 8-тактовой фразы', () => {
    const e = exemplars[0]
    const song = { bpm: 128, beatTimes: grid(128, 0) }
    const tl = choreograph(e.script, { seed: 2, beatTimes: song.beatTimes, song })
    const p = phraseLen(128)
    const turn = tl.beats.find((w) => w.beat === tl.turn)!
    const off = turn.start % (p / 2)
    expect(Math.min(off, p / 2 - off)).toBeLessThan(1.2)
    expect(tl.duration).toBeGreaterThanOrEqual(SONG_MIN)
    const endOff = tl.duration % p
    expect(Math.min(endOff, p - endOff)).toBeLessThan(2)
  })

  it('без песни — как раньше', () => {
    const tl = choreograph(exemplars[0].script, { seed: 1 })
    expect(tl.duration).toBeLessThan(SONG_MIN + 30)
  })
})
