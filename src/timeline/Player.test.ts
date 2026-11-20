import { describe, expect, it } from 'vitest'
import type { DayScript } from '../types/script'
import { choreograph } from './choreograph'
import { DebugStage } from './debugStage'
import { TimelinePlayer } from './Player'
import day1 from './samples/day1.json'

const script = day1 as unknown as DayScript
const tl = choreograph(script, { seed: 11 })

function setup() {
  let now = 100
  const clock = () => now
  const player = new TimelinePlayer({ clock })
  const stage = new DebugStage()
  player.load(tl, stage, 'текст')
  const advance = (sec: number, fps = 60) => {
    const steps = Math.round(sec * fps)
    for (let i = 0; i < steps; i++) {
      now += 1 / fps
      player.tick()
    }
  }
  return { player, stage, advance, setNow: (v: number) => (now = v) }
}

describe('TimelinePlayer', () => {
  it('load вызывает prepare', () => {
    const { stage } = setup()
    expect(stage.prepares).toHaveLength(1)
    expect(stage.prepares[0]).toMatchObject({ text: 'текст', seed: 11 })
    expect(stage.handled).toHaveLength(0)
  })

  it('каждое событие срабатывает ровно один раз и не раньше своего t', () => {
    const { player, stage, advance } = setup()
    let ended = 0
    player.onEnd(() => ended++)
    let progress = 0
    player.onProgress(() => progress++)
    player.play()
    advance(tl.duration + 2)
    expect(stage.handled).toHaveLength(tl.events.length)
    expect(stage.handled.map((h) => h.event)).toEqual(tl.events)
    for (const h of stage.handled) expect(h.event.t).toBeLessThanOrEqual(player.time + 1e-9)
    expect(ended).toBe(1)
    expect(player.playing).toBe(false)
    expect(progress).toBeGreaterThan(100)
    expect(stage.updates).toBeGreaterThan(60 * 30)
  })

  it('события срабатывают в кадре, когда часы проходят t', () => {
    const { player, stage, advance } = setup()
    player.play()
    advance(10)
    const fired = new Set(stage.handled.map((h) => h.event))
    for (const e of tl.events) expect(fired.has(e)).toBe(e.t <= player.time + 1e-9)
  })

  it('пауза останавливает время', () => {
    const { player, advance } = setup()
    player.play()
    advance(2)
    const t = player.time
    player.pause()
    advance(3)
    expect(player.time).toBe(t)
    player.play()
    advance(1)
    expect(player.time).toBeCloseTo(t + 1, 1)
  })

  it('setRate ускоряет', () => {
    const { player, advance } = setup()
    player.setRate(2)
    player.play()
    advance(2)
    expect(player.time).toBeCloseTo(4, 1)
  })

  it('перемотка вперёд догоняет пропущенные события, каждое один раз', () => {
    const { player, stage, advance } = setup()
    player.play()
    advance(1)
    player.seek(25)
    const upTo25 = tl.events.filter((e) => e.t <= 25)
    expect(stage.handled.map((h) => h.event)).toEqual(upTo25)
    advance(tl.duration)
    expect(stage.handled).toHaveLength(tl.events.length)
    expect(new Set(stage.handled.map((h) => h.event)).size).toBe(tl.events.length)
  })

  it('перемотка назад: заново prepare и проигрывание событий до t', () => {
    const { player, stage, advance } = setup()
    player.play()
    advance(30)
    player.seek(12)
    expect(stage.prepares).toHaveLength(2)
    expect(stage.handled.map((h) => h.event)).toEqual(tl.events.filter((e) => e.t <= 12))
    advance(tl.duration)
    expect(stage.handled.map((h) => h.event)).toEqual(tl.events)
  })

  it('часы-аудио: время фильма следует за приращениями часов', () => {
    const { player, setNow } = setup()
    setNow(0)
    player.play()
    setNow(3.5)
    player.tick()
    expect(player.time).toBeCloseTo(3.5, 6)
    // большой скачок (вкладка спала) — время догоняет, dt в update обрезан
    setNow(10)
    player.tick()
    expect(player.time).toBeCloseTo(10, 6)
  })

  it('после конца play() начинает заново', () => {
    const { player, stage, advance } = setup()
    player.play()
    advance(tl.duration + 1)
    player.play()
    expect(stage.prepares.length).toBeGreaterThanOrEqual(2)
    advance(1)
    expect(player.time).toBeCloseTo(1, 1)
  })

  it('передаёт уровень звука в stage', () => {
    let now = 0
    const player = new TimelinePlayer({ clock: () => now, audio: { getLevel: () => 0.5, isBeat: () => true } })
    const stage = new DebugStage()
    player.load(tl, stage, '')
    player.play()
    now = 0.1
    player.tick()
    expect(stage.audio.at(-1)).toEqual({ level: 0.5, beat: true })
  })
})
