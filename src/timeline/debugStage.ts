// Stage, который ничего не рисует, а только записывает вызовы. Для тестов и тест-стенда.
import type { Mood } from '../types/script'
import type { Stage, TimelineEvent } from '../types/timeline'

export interface DebugRecord {
  /** Время фильма на момент вызова handle. */
  at: number
  event: TimelineEvent
}

export class DebugStage implements Stage {
  prepares: { text: string; mood: Mood; seed: number }[] = []
  handled: DebugRecord[] = []
  updates = 0
  lastTime = 0
  audio: { level: number; beat: boolean }[] = []
  /** Печатать события в консоль. */
  constructor(private log = false) {}

  prepare(input: { text: string; mood: Mood; seed: number }): void {
    this.prepares.push(input)
    this.handled = []
    if (this.log) console.log('[stage] prepare', input.seed)
  }

  handle(event: TimelineEvent): void {
    this.handled.push({ at: this.lastTime, event })
    if (this.log) console.log(`[stage] ${event.t.toFixed(2)}s ${event.type}`, event)
  }

  update(time: number, _dt: number): void {
    this.lastTime = time
    this.updates++
  }

  setAudioLevel(level: number, beat: boolean): void {
    this.audio.push({ level, beat })
  }
}
