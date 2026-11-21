import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Beat, DayScript } from '../types/script'
import type { TimelineEvent } from '../types/timeline'
import { choreograph, computePace } from './choreograph'
import day1 from './samples/day1.json'
import day2 from './samples/day2.json'
import day3 from './samples/day3.json'

const samples = [day1, day2, day3] as unknown as DayScript[]
const texts = [1, 2, 3].map((n) => readFileSync(join(__dirname, 'samples', `day${n}.txt`), 'utf8'))

function withBeats(base: DayScript, n: number): DayScript {
  const beats: Beat[] = []
  for (let i = 0; i < n; i++) beats.push({ ...base.beats[i % base.beats.length] })
  return { ...base, beats }
}

const cameras = (events: TimelineEvent[]) => events.filter((e) => e.type === 'camera') as Extract<TimelineEvent, { type: 'camera' }>[]

describe('samples', () => {
  it('каждая цитата — точная подстрока текста', () => {
    samples.forEach((s, i) => {
      for (const b of s.beats) expect(texts[i].includes(b.quote), b.quote).toBe(true)
      expect(s.beats.length).toBeGreaterThanOrEqual(4)
      expect(s.beats.length).toBeLessThanOrEqual(7)
      expect(s.why).toHaveLength(3)
    })
  })
})

describe('choreograph', () => {
  it('детерминирован: тот же сценарий + seed → тот же таймлайн', () => {
    for (const s of samples) {
      const a = choreograph(s, { seed: 42 })
      const b = choreograph(s, { seed: 42 })
      expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    }
    const c = choreograph(samples[0], { seed: 7 })
    expect(JSON.stringify(c.events)).not.toBe(JSON.stringify(choreograph(samples[0], { seed: 42 }).events))
  })

  it('pace: спокойно ≈ 1.3, напряжённо ≈ 0.7', () => {
    expect(computePace(samples[0])).toBeGreaterThan(1.2)
    expect(computePace(samples[2])).toBeGreaterThan(1.2)
    expect(computePace(samples[1])).toBeLessThan(0.8)
  })

  const variants: [string, DayScript][] = []
  for (const s of samples) for (const n of [4, 7]) variants.push([`${s.title} × ${n}`, withBeats(s, n)])
  variants.push(['день 4 бита без противоречия, тихий', { ...withBeats(samples[1], 4), contradiction: null }])

  it.each(variants)('%s: 30–60 с, отсортировано, ничего не вылезает за конец', (_name, s) => {
    for (const seed of [1, 2, 3, 999]) {
      const tl = choreograph(s, { seed })
      expect(tl.duration).toBeGreaterThanOrEqual(30)
      expect(tl.duration).toBeLessThanOrEqual(60)
      for (let i = 1; i < tl.events.length; i++) expect(tl.events[i].t).toBeGreaterThanOrEqual(tl.events[i - 1].t)
      for (const e of tl.events) {
        expect(e.t).toBeGreaterThanOrEqual(0)
        expect(e.dur).toBeGreaterThan(0)
        expect(e.t + e.dur).toBeLessThanOrEqual(tl.duration + 1e-6)
      }
    }
  })

  it('maxDuration ограничивает длину', () => {
    const tl = choreograph(withBeats(samples[0], 7), { seed: 1, maxDuration: 45 })
    expect(tl.duration).toBeLessThanOrEqual(45)
  })

  it.each(variants)('%s: правила монтажа', (_name, s) => {
    const tl = choreograph(s, { seed: 5 })
    const cams = cameras(tl.events)
    // вступление: wide → push_in
    expect(cams[0].shot).toBe('wide')
    expect(cams[1].shot).toBe('push_in')
    // первый бит — с общего плана
    expect(cams.find((c) => c.beat === 0)!.shot).toBe('wide')
    // нет двух push_in подряд
    for (let i = 1; i < cams.length; i++) expect(cams[i].shot === 'push_in' && cams[i - 1].shot === 'push_in').toBe(false)
    // последний план — отъезд
    expect(cams[cams.length - 1].shot).toBe('pull_out')
    // противоречие: hold 2–3 с и staging
    const staging = tl.events.filter((e) => e.type === 'staging')
    if (s.contradiction) {
      expect(staging).toHaveLength(1)
      const hold = cams.find((c) => c.t === staging[0].t && c.shot === 'hold')!
      expect(hold).toBeTruthy()
      expect(hold.dur).toBeGreaterThanOrEqual(2)
      expect(hold.dur).toBeLessThanOrEqual(3)
    } else expect(staging).toHaveLength(0)
    // вступление и финал
    const types = tl.events.map((e) => e.type)
    expect(types[0]).toBe('camera')
    expect(types).toContain('book_open')
    expect(tl.events.find((e) => e.type === 'actor_enter')!).toMatchObject({ actor: 'hero', beat: -1 })
    const last = tl.events.filter((e) => e.beat === -1 && e.t > 10).map((e) => e.type)
    expect(last).toEqual(expect.arrayContaining(['book_close', 'title_reveal', 'to_shelf']))
    expect(tl.events.find((e) => e.type === 'title_reveal')).toMatchObject({ title: s.title })
  })

  it('каждый бит: walk → (action) → lift → transform → реакция, в таком порядке', () => {
    const s = samples[0]
    const tl = choreograph(s, { seed: 3 })
    s.beats.forEach((b, i) => {
      const ev = tl.events.filter((e) => e.beat === i && e.type !== 'camera' && e.type !== 'scene_effect' && e.type !== 'actor_enter' && e.type !== 'staging')
      expect(ev.map((e) => e.type)).toEqual(['actor_walk', 'actor_action', 'word_lift', 'word_transform', 'actor_action'])
      expect(ev[0]).toMatchObject({ toQuote: b.quote })
      expect(ev[1]).toMatchObject({ action: b.action })
      expect(ev[3]).toMatchObject({ quote: b.quote, result: b.result })
      if (b.effect) expect(tl.events.some((e) => e.type === 'scene_effect' && e.beat === i && e.effect === b.effect)).toBe(true)
    })
  })

  it('реакции по правилам: какао → drink, иней → shiver, искры → cheer, pop-up → sit', () => {
    const reaction = (s: DayScript, i: number, seed = 1) => {
      const acts = choreograph(s, { seed }).events.filter((e) => e.beat === i && e.type === 'actor_action')
      return (acts[acts.length - 1] as Extract<TimelineEvent, { type: 'actor_action' }>).action
    }
    expect(reaction(samples[0], 3)).toBe('drink') // какао
    expect(reaction(samples[2], 2)).toBe('shiver') // иней (действие sit)
    expect(reaction(samples[0], 2)).toBe('sit') // иней, но действие уже shiver — не повторяем
    expect(reaction(samples[0], 0)).toBe('sit') // дерево
    expect(reaction(samples[1], 4)).toBe('cheer') // искры
    expect(reaction(samples[1], 2)).toBe('drink') // кофе
  })

  it('person → actor_enter для second', () => {
    const tl = choreograph(samples[0], { seed: 1 })
    const enters = tl.events.filter((e) => e.type === 'actor_enter' && e.actor === 'second')
    expect(enters).toHaveLength(1)
    expect(enters[0].beat).toBe(4)
  })

  it('притягивает начала блоков к ударам в пределах ±0,4 с', () => {
    const s = samples[1]
    const bpm = 128
    const beatTimes = Array.from({ length: 200 }, (_, i) => 0.13 + (i * 60) / bpm)
    const tl = choreograph(s, { seed: 9, beatTimes })
    const plain = choreograph(s, { seed: 9 })
    const starts = cameras(tl.events).filter((c) => c.beat >= 0).map((c) => c.t)
    const plainStarts = cameras(plain.events).filter((c) => c.beat >= 0).map((c) => c.t)
    expect(starts.length).toBe(plainStarts.length)
    for (const t of starts) {
      const d = Math.min(...beatTimes.map((b) => Math.abs(b - t)))
      expect(d).toBeLessThan(0.002)
    }
    expect(tl.duration).toBeLessThanOrEqual(60)
    // без ударов ничего не притягивается
    expect(plainStarts.some((t) => Math.min(...beatTimes.map((b) => Math.abs(b - t))) > 0.01)).toBe(true)
  })

  it('удары далеко — блоки остаются на месте', () => {
    const s = samples[2]
    const far = [1000, 2000]
    expect(JSON.stringify(choreograph(s, { seed: 4, beatTimes: far }).events)).toBe(JSON.stringify(choreograph(s, { seed: 4 }).events))
  })
})

describe('L7: полароид, облёт, камера', () => {
  const days = samples

  it('без фото — полароида нет', () => {
    for (const s of days) {
      const tl = choreograph(s, { seed: 3 })
      expect(tl.events.some((e) => e.type === 'photo_reveal' || e.type === 'photo_fan')).toBe(false)
    }
  })

  it('фото есть: photo_reveal 7–9 с после второго бита (после первого при 4 битах), без camera внутри, camera сразу после', () => {
    for (const s of days) {
      for (const photoCount of [1, 3]) {
        const tl = choreograph(s, { seed: 3, photoCount })
        expect(tl.duration).toBeLessThanOrEqual(60.5)
        const rev = tl.events.filter((e) => e.type === 'photo_reveal')
        expect(rev).toHaveLength(1)
        const r = rev[0] as Extract<TimelineEvent, { type: 'photo_reveal' }>
        expect(r.photo).toBe(0)
        expect(r.dur).toBeGreaterThanOrEqual(7)
        expect(r.dur).toBeLessThanOrEqual(9)
        const after = s.beats.length <= 4 ? 0 : 1
        const lastOfBeat = Math.max(...tl.events.filter((e) => e.beat === after && e.type !== 'photo_reveal' && e.type !== 'photo_fan' && e.type !== 'camera').map((e) => e.t + e.dur))
        expect(r.t).toBeGreaterThanOrEqual(lastOfBeat - 1e-6)
        const firstNext = Math.min(...tl.events.filter((e) => e.beat === after + 1).map((e) => e.t))
        expect(r.t + r.dur).toBeLessThanOrEqual(firstNext + 1e-6)
        // внутри — никакой камеры и никаких действий
        const inside = tl.events.filter((e) => e !== r && e.t > r.t + 1e-6 && e.t < r.t + r.dur - 1e-6)
        expect(inside.filter((e) => e.type === 'camera')).toEqual([])
        expect(inside.filter((e) => e.type === 'actor_walk' || e.type === 'word_lift')).toEqual([])
        const cam = tl.events.find((e) => e.type === 'camera' && Math.abs(e.t - (r.t + r.dur)) < 1e-6) as Extract<TimelineEvent, { type: 'camera' }>
        expect(cam && ['wide', 'push_in'].includes(cam.shot)).toBe(true)
        const fan = tl.events.filter((e) => e.type === 'photo_fan') as Extract<TimelineEvent, { type: 'photo_fan' }>[]
        if (photoCount > 1) {
          expect(fan).toHaveLength(1)
          expect(fan[0].from).toBe(1)
          expect(fan[0].t).toBeCloseTo(r.t + r.dur, 5)
          expect(fan[0].dur).toBeGreaterThanOrEqual(2)
          expect(fan[0].dur).toBeLessThanOrEqual(3)
        } else expect(fan).toHaveLength(0)
      }
    }
  })

  it('в каждом фильме есть облёт с targetQuote, не на первом бите', () => {
    for (const s of days)
      for (const seed of [1, 2, 3]) {
        const tl = choreograph(s, { seed, photoCount: 2 })
        const orbits = tl.events.filter((e) => e.type === 'camera' && e.shot === 'orbit_quarter') as Extract<TimelineEvent, { type: 'camera' }>[]
        expect(orbits.length).toBeGreaterThanOrEqual(1)
        expect(orbits.every((o) => o.targetQuote && s.beats.some((b) => b.quote === o.targetQuote))).toBe(true)
        expect(orbits.some((o) => o.beat === 0)).toBe(false)
      }
  })

  it('общий план в середине фильма — только у первого бита и у веера снимков', () => {
    for (const s of days) {
      const tl = choreograph(s, { seed: 5, photoCount: 2 })
      const mid = tl.events.filter((e) => e.type === 'camera' && e.shot === 'wide' && e.beat > 0) as Extract<TimelineEvent, { type: 'camera' }>[]
      for (const c of mid) expect(tl.events.some((e) => e.type === 'photo_fan' && Math.abs(e.t - c.t) < 1e-6)).toBe(true)
    }
  })
})
