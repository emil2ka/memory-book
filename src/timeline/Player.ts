// Проигрыватель таймлайна. Не зависит от браузера: часы и кадры передаются снаружи.
//
//   const player = new TimelinePlayer({ clock: () => song.currentTime, audio: song })
//   player.load(timeline, stage, text)
//   player.play()
//   function frame() { player.tick(); requestAnimationFrame(frame) }
//
// Время фильма считается как сумма приращений часов × rate, поэтому подходит и
// performance.now, и audio.currentTime (пауза звука = пауза фильма).
import type { Stage, Timeline } from '../types/timeline'

/** Источник уровня звука (например, SongPlayer). */
export interface AudioLevelSource {
  getLevel(): number
  isBeat(): boolean
}

export interface TimelinePlayerOptions {
  /** Часы в СЕКУНДАХ. По умолчанию performance.now() / 1000. */
  clock?: () => number
  /** Если задан, каждый кадр передаёт уровень и удар в stage.setAudioLevel. */
  audio?: AudioLevelSource
  /** Самый большой dt, который получит stage.update за кадр (после сна вкладки), секунды. */
  maxDt?: number
}

const defaultClock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000

export class TimelinePlayer {
  private clock: () => number
  private audio?: AudioLevelSource
  private maxDt: number
  private timeline: Timeline | null = null
  private stage: Stage | null = null
  private text = ''
  private next = 0
  private _time = 0
  private _rate = 1
  private _playing = false
  private _ended = false
  private lastClock: number | null = null
  private endCbs: (() => void)[] = []
  private progressCbs: ((time: number, duration: number) => void)[] = []

  constructor(opts: TimelinePlayerOptions = {}) {
    this.clock = opts.clock ?? defaultClock
    this.audio = opts.audio
    this.maxDt = opts.maxDt ?? 0.25
  }

  get time(): number { return this._time }
  get duration(): number { return this.timeline?.duration ?? 0 }
  get playing(): boolean { return this._playing }
  get rate(): number { return this._rate }
  get ended(): boolean { return this._ended }

  /** Загрузить фильм: вызывает stage.prepare и ставит время в 0. */
  load(timeline: Timeline, stage: Stage, text: string): void {
    this.timeline = timeline
    this.stage = stage
    this.text = text
    this._playing = false
    this.lastClock = null
    this.stage.prepare({ text, mood: timeline.mood, seed: timeline.seed })
    this.next = 0
    this._time = 0
    this._ended = false
    this.stage.update(0, 0)
  }

  play(): void {
    if (!this.timeline) return
    if (this._ended) this.seek(0)
    this._playing = true
    this.lastClock = this.clock()
  }

  pause(): void {
    this._playing = false
    this.lastClock = null
  }

  setRate(r: number): void {
    this._rate = Math.max(0, Number.isFinite(r) ? r : 1)
  }

  setClock(clock: () => number): void {
    this.clock = clock
    if (this._playing) this.lastClock = this.clock()
  }

  setAudio(audio: AudioLevelSource | undefined): void {
    this.audio = audio
  }

  onEnd(cb: () => void): () => void {
    this.endCbs.push(cb)
    return () => { this.endCbs = this.endCbs.filter((c) => c !== cb) }
  }

  onProgress(cb: (time: number, duration: number) => void): () => void {
    this.progressCbs.push(cb)
    return () => { this.progressCbs = this.progressCbs.filter((c) => c !== cb) }
  }

  /**
   * Перейти к моменту t. Вперёд — догоняет пропущенные события (каждое ровно раз).
   * Назад — заново prepare и проигрывает все события до t.
   */
  seek(t: number): void {
    if (!this.timeline || !this.stage) return
    const target = Math.min(Math.max(0, t), this.timeline.duration)
    if (target < this._time) {
      this.reset(target)
    } else {
      this.advanceTo(target)
    }
    this._ended = false
    this.stage.update(this._time, 0)
    if (this._playing) this.lastClock = this.clock()
    this.emitProgress()
    if (target >= this.timeline.duration) this.finish()
  }

  /**
   * Один кадр. now — показание часов в секундах (если не передано, берётся clock()).
   * Не передавайте сюда метку requestAnimationFrame в миллисекундах.
   */
  tick(now?: number): void {
    if (!this.timeline || !this.stage) return
    const c = now ?? this.clock()
    let dt = 0
    if (this._playing && !this._ended) {
      // Время фильма идёт на полное приращение часов (не отстаёт от звука после сна вкладки),
      // а в stage.update уходит dt, обрезанный до maxDt, чтобы анимации не прыгали.
      const step = this.lastClock !== null ? Math.max(0, c - this.lastClock) * this._rate : 0
      this.lastClock = c
      dt = Math.min(this.maxDt, step)
      this.advanceTo(Math.min(this.timeline.duration, this._time + step))
    }
    if (this.audio && this.stage.setAudioLevel) {
      this.stage.setAudioLevel(this.audio.getLevel(), this.audio.isBeat())
    }
    this.stage.update(this._time, dt)
    if (this._playing) this.emitProgress()
    if (this._playing && this._time >= this.timeline.duration) this.finish()
  }

  private reset(target: number): void {
    const tl = this.timeline!
    this.stage!.prepare({ text: this.text, mood: tl.mood, seed: tl.seed })
    this.next = 0
    this._time = 0
    this._ended = false
    this.advanceTo(target)
  }

  private advanceTo(target: number): void {
    const tl = this.timeline!
    const events = tl.events
    this._time = target
    while (this.next < events.length && events[this.next].t <= target + 1e-9) {
      this.stage!.handle(events[this.next])
      this.next++
    }
  }

  private emitProgress(): void {
    for (const cb of this.progressCbs) cb(this._time, this.duration)
  }

  private finish(): void {
    if (this._ended) return
    this._ended = true
    this._playing = false
    this.lastClock = null
    for (const cb of this.endCbs) cb()
  }
}
