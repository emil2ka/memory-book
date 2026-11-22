// Песня дня: <audio> + Web Audio AnalyserNode. Только браузер.
//
//   const song = new SongPlayer()
//   await song.load(file)          // File | Blob | URL
//   await song.play()              // строго после жеста пользователя (клик)
//   const player = new TimelinePlayer({ clock: () => song.currentTime, audio: song })
//
// getLevel() — сглаженный RMS 0..1; isBeat() — был ли удар с прошлого кадра.
// Удары берутся из анализа файла (estimateBeats), а пока анализа нет — по скачку энергии.
import { estimateBeats, tempoToCategory, toMono, type BeatEstimate } from './tempo'
import type { Tempo } from '../types/script'
import { energyCurve } from '../timeline/songShape'

export interface SongAnalysis extends BeatEstimate {
  tempo: Tempo
  /** Средняя громкость трека 0..1 — подсказка для song.energy. */
  energy: number
  duration: number
  /** Громкость по секундам 0..1 (первые 90 с): где подъём и затухание — под них поворот и конец фильма (план 15). */
  energyCurve?: number[]
}

type AudioCtxCtor = typeof AudioContext

export class SongPlayer {
  readonly audio: HTMLAudioElement
  private ctx: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaElementAudioSourceNode | null = null
  private buf: Float32Array<ArrayBuffer> | null = null
  private objectUrl: string | null = null
  private level = 0
  private beat = false
  private lastFrameAt = -1
  private lastAudioTime = 0
  private energyAvg = 0
  private lastOnsetAt = -10
  private beatIdx = 0
  private loadToken = 0
  /** Результат анализа файла; null, пока не готов или если не удался. */
  analysis: SongAnalysis | null = null
  /** Промис анализа текущего трека. */
  analysisReady: Promise<SongAnalysis | null> = Promise.resolve(null)

  constructor() {
    this.audio = new Audio()
    this.audio.preload = 'auto'
    this.audio.crossOrigin = 'anonymous'
  }

  /** Загрузить трек. Анализ темпа идёт в фоне (см. analysisReady). */
  async load(src: File | Blob | string): Promise<void> {
    const token = ++this.loadToken
    this.pause()
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
    this.objectUrl = null
    this.analysis = null
    this.beatIdx = 0
    let url: string
    if (typeof src === 'string') url = src
    else {
      url = URL.createObjectURL(src)
      this.objectUrl = url
    }
    this.audio.src = url
    this.audio.load()
    await new Promise<void>((resolve, reject) => {
      const ok = () => { cleanup(); resolve() }
      const bad = () => { cleanup(); reject(new Error('Не удалось загрузить аудио')) }
      const cleanup = () => {
        this.audio.removeEventListener('loadedmetadata', ok)
        this.audio.removeEventListener('error', bad)
      }
      this.audio.addEventListener('loadedmetadata', ok)
      this.audio.addEventListener('error', bad)
    })
    this.analysisReady = this.analyze(src, token).catch(() => null)
  }

  private ensureGraph(): void {
    if (this.ctx) return
    const Ctor: AudioCtxCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: AudioCtxCtor }).webkitAudioContext
    this.ctx = new Ctor()
    this.analyser = this.ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0
    this.source = this.ctx.createMediaElementSource(this.audio)
    this.source.connect(this.analyser)
    this.analyser.connect(this.ctx.destination)
    this.buf = new Float32Array(new ArrayBuffer(this.analyser.fftSize * 4))
  }

  /** Вызывать из обработчика клика (политика автозапуска браузеров). */
  async play(): Promise<void> {
    this.ensureGraph()
    if (this.ctx!.state === 'suspended') await this.ctx!.resume()
    await this.audio.play()
  }

  pause(): void {
    this.audio.pause()
  }

  get paused(): boolean { return this.audio.paused }
  get currentTime(): number { return this.audio.currentTime }
  set currentTime(t: number) {
    this.audio.currentTime = t
    this.syncBeatIndex(t)
  }
  get duration(): number { return Number.isFinite(this.audio.duration) ? this.audio.duration : 0 }
  set volume(v: number) { this.audio.volume = Math.max(0, Math.min(1, v)) }

  seek(t: number): void { this.currentTime = t }

  /** Сглаженный уровень 0..1. Пересчитывается не чаще раза в кадр. */
  getLevel(): number {
    this.updateFrame()
    return this.level
  }

  /** Был ли удар с прошлого кадра. */
  isBeat(): boolean {
    this.updateFrame()
    return this.beat
  }

  private updateFrame(): void {
    const now = performance.now()
    if (now - this.lastFrameAt < 4) return
    this.lastFrameAt = now
    this.beat = false
    if (!this.analyser || !this.buf || this.audio.paused) {
      this.level *= 0.9
      return
    }
    this.analyser.getFloatTimeDomainData(this.buf)
    let s = 0
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i]
    const rms = Math.sqrt(s / this.buf.length)
    const target = Math.min(1, rms * 3.2)
    // Быстрая атака, медленный спад.
    this.level += (target - this.level) * (target > this.level ? 0.5 : 0.12)

    const t = this.audio.currentTime
    const beats = this.analysis?.beatTimes
    if (beats && beats.length) {
      if (t < this.lastAudioTime - 0.05) this.syncBeatIndex(t)
      while (this.beatIdx < beats.length && beats[this.beatIdx] <= t) {
        this.beat = true
        this.beatIdx++
      }
    } else {
      this.energyAvg += (rms - this.energyAvg) * 0.05
      if (rms > this.energyAvg * 1.5 && rms > 0.02 && t - this.lastOnsetAt > 0.25) {
        this.beat = true
        this.lastOnsetAt = t
      }
    }
    this.lastAudioTime = t
  }

  private syncBeatIndex(t: number): void {
    const beats = this.analysis?.beatTimes ?? []
    let i = 0
    while (i < beats.length && beats[i] <= t) i++
    this.beatIdx = i
    this.lastAudioTime = t
  }

  private async analyze(src: File | Blob | string, token: number): Promise<SongAnalysis | null> {
    const data = typeof src === 'string' ? await (await fetch(src)).arrayBuffer() : await src.arrayBuffer()
    const Ctor: typeof OfflineAudioContext = window.OfflineAudioContext
    // Декодируем в 22,05 кГц — для темпа хватает, и вдвое быстрее.
    const off = new Ctor(1, 22050, 22050)
    const decoded = await off.decodeAudioData(data)
    const channels: Float32Array[] = []
    for (let c = 0; c < decoded.numberOfChannels; c++) channels.push(decoded.getChannelData(c))
    const mono = toMono(channels)
    // Анализируем первые 90 секунд: фильм всё равно короче.
    const slice = mono.subarray(0, Math.min(mono.length, decoded.sampleRate * 90))
    const est = estimateBeats(slice, decoded.sampleRate)
    let s = 0
    for (let i = 0; i < slice.length; i += 16) s += slice[i] * slice[i]
    const rms = Math.sqrt(s / Math.max(1, slice.length / 16))
    const result: SongAnalysis = {
      ...est,
      tempo: tempoToCategory(est.bpm),
      energy: Math.round(Math.min(1, rms * 4) * 100) / 100,
      duration: decoded.duration,
      energyCurve: energyCurve(slice, decoded.sampleRate),
    }
    if (token !== this.loadToken) return null
    this.analysis = result
    this.syncBeatIndex(this.audio.currentTime)
    return result
  }

  dispose(): void {
    this.pause()
    this.source?.disconnect()
    this.analyser?.disconnect()
    void this.ctx?.close()
    this.ctx = null
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
  }
}
