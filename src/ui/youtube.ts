// Песня дня через официальный плеер YouTube (план 15 § 1.6): файлов у нас нет (правило 7), играет встроенный
// плеер youtube-nocookie. Фильм стартует, когда плеер реально заиграл (реклама и загрузка не сбивают синхрон);
// часы фильма — getCurrentTime() с плавной досчёткой между его обновлениями; в конце громкость уходит и пауза.
// Уровня громкости из iframe нет — getLevel/isBeat дают ровную пульсацию по темпу.
import type { AudioLevelSource } from '../timeline/Player'

/** id ролика из ссылки: youtube.com/watch?v=, youtu.be/, music.youtube.com, /shorts/, /embed/, /live/. */
export function youTubeId(url: string | undefined | null): string | null {
  if (!url) return null
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  const host = u.hostname.replace(/^www\.|^m\./, '')
  const ok = (id: string | null | undefined) => (id && /^[\w-]{11}$/.test(id) ? id : null)
  if (host === 'youtu.be') return ok(u.pathname.slice(1).split('/')[0])
  if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'youtube-nocookie.com') {
    const v = u.searchParams.get('v')
    if (v) return ok(v)
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/)
    return ok(m?.[1])
  }
  return null
}

/** Темп ручки 0..1 → удары в минуту для ровной пульсации (медленно 72 … быстро 136). */
export const knobBpm = (tempo: number | undefined) => Math.round(72 + (tempo ?? 0.5) * 64)

// ---- IFrame API (один раз на страницу) ----
interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(s: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getPlayerState(): number
  setVolume(v: number): void
  getVolume(): number
  mute(): void
  unMute(): void
  cueVideoById(id: string): void
  destroy(): void
}
interface YTNamespace {
  Player: new (el: HTMLElement, opts: Record<string, unknown>) => YTPlayer
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number; CUED: number }
}
declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiP: Promise<YTNamespace> | null = null
function loadApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiP ??= new Promise<YTNamespace>((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve(window.YT!)
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => {
      apiP = null
      reject(new Error('YouTube API не загрузился'))
    }
    document.head.appendChild(s)
  })
  return apiP
}

/**
 * Маленький плеер в углу экрана (виден, пока играет: условия YouTube не разрешают прятать плеер совсем).
 * Один на приложение: load(id) → prime() в клике → start() перед фильмом → clock() → fadeOut().
 */
export class YouTubeSong implements AudioLevelSource {
  private box: HTMLDivElement
  private player: YTPlayer | null = null
  private ready: Promise<YTPlayer> | null = null
  private id: string | null = null
  private bpm = 100
  private t0 = 0
  private lastYt = -1
  private lastWall = 0
  private lastBeat = -1
  private beatNow = false
  private primeTimer: ReturnType<typeof setTimeout> | null = null
  /** ошибка плеера (101/150 — встраивание запрещено, 100 — ролика нет) */
  error: number | null = null

  constructor() {
    this.box = document.createElement('div')
    this.box.className = 'yt-mini'
    this.box.setAttribute('aria-label', 'песня дня с YouTube')
    const slot = document.createElement('div')
    this.box.appendChild(slot)
    document.body.appendChild(this.box)
  }

  get videoId() {
    return this.id
  }

  /** Подготовить ролик (без звука и показа). Повтор с тем же id ничего не делает. */
  load(id: string, bpm = 100): Promise<YTPlayer> {
    this.bpm = bpm
    if (this.ready && this.id === id) return this.ready
    this.id = id
    this.error = null
    this.ready = loadApi().then(
      (YT) =>
        new Promise<YTPlayer>((resolve, reject) => {
          if (this.player) {
            this.player.cueVideoById(id)
            resolve(this.player)
            return
          }
          const slot = this.box.firstElementChild as HTMLElement
          const p = new YT.Player(slot, {
            host: 'https://www.youtube-nocookie.com',
            videoId: id,
            width: 192,
            height: 108,
            playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1, rel: 0, modestbranding: 1, fs: 0, iv_load_policy: 3 },
            events: {
              onReady: () => {
                this.player = p
                resolve(p)
              },
              onError: (e: { data: number }) => {
                this.error = e.data
                reject(new Error(`YouTube: ошибка ${e.data}`))
              },
            },
          })
        }),
    )
    this.ready.catch(() => {
      /* без YouTube — фильм без звука */
    })
    return this.ready
  }

  /**
   * В самом клике пользователя: запустить ролик без звука и сразу на паузу — после этого браузер даст играть
   * со звуком и позже (политика автозапуска). Ролик ещё грузится — тихо пропускаем.
   */
  prime(): void {
    const p = this.player
    if (!p) return
    try {
      p.mute()
      p.playVideo()
      if (this.primeTimer) clearTimeout(this.primeTimer)
      this.primeTimer = setTimeout(() => {
        this.primeTimer = null
        p.pauseVideo()
        p.seekTo(0, true)
      }, 250)
    } catch {
      /* ничего */
    }
  }

  /** Перед фильмом: с начала, со звуком; ждём состояния PLAYING (реклама, загрузка). false — не заиграл за timeout. */
  async start(timeoutMs = 12000): Promise<boolean> {
    let p: YTPlayer
    try {
      p = await Promise.race([this.ready ?? Promise.reject(new Error('нет ролика')), timeout(timeoutMs)])
    } catch {
      return false
    }
    const YT = window.YT!
    // отложенная пауза от prime() не должна остановить уже начатую песню
    if (this.primeTimer) {
      clearTimeout(this.primeTimer)
      this.primeTimer = null
    }
    p.seekTo(0, true)
    p.unMute()
    p.setVolume(100)
    p.playVideo()
    const t = performance.now()
    while (performance.now() - t < timeoutMs) {
      if (p.getPlayerState() === YT.PlayerState.PLAYING) {
        this.box.classList.add('on')
        this.t0 = p.getCurrentTime()
        this.lastYt = -1
        this.lastBeat = -1
        return true
      }
      if (this.error !== null) return false
      await new Promise((r) => setTimeout(r, 100))
    }
    p.pauseVideo()
    return false
  }

  /** Часы фильма от плеера: getCurrentTime() обновляется рывками, между ними досчитываем по системным часам. */
  clock(): () => number {
    return () => {
      const p = this.player
      if (!p) return 0
      const yt = p.getCurrentTime() - this.t0
      const now = performance.now() / 1000
      const playing = p.getPlayerState() === window.YT?.PlayerState.PLAYING
      if (yt !== this.lastYt) {
        this.lastYt = yt
        this.lastWall = now
        return yt
      }
      return playing ? yt + Math.min(0.5, now - this.lastWall) : yt
    }
  }

  /** Доли по темпу ручки — для шагов и склеек фильма (настоящих долей из iframe нет). */
  beatTimes(seconds = 600): number[] {
    const step = 60 / this.bpm
    return Array.from({ length: Math.ceil(seconds / step) }, (_, i) => +(i * step).toFixed(3))
  }

  getLevel(): number {
    const t = this.clockNow()
    const ph = ((t * this.bpm) / 60) % 1
    return 0.35 + 0.35 * Math.exp(-ph * 5)
  }

  isBeat(): boolean {
    const t = this.clockNow()
    const k = Math.floor((t * this.bpm) / 60)
    this.beatNow = k !== this.lastBeat
    this.lastBeat = k
    return this.beatNow
  }

  private clockNow(): number {
    try {
      return this.player ? this.player.getCurrentTime() : 0
    } catch {
      return 0
    }
  }

  /** Продолжить после паузы (пробел во время фильма). */
  resume(): void {
    try {
      this.player?.playVideo()
      this.box.classList.add('on')
    } catch {
      /* ничего */
    }
  }

  pause(): void {
    try {
      this.player?.pauseVideo()
    } catch {
      /* ничего */
    }
    this.box.classList.remove('on')
  }

  /** Плавно приглушить и поставить на паузу. */
  fadeOut(ms = 1500): void {
    const p = this.player
    if (!p) return
    const v0 = p.getVolume() || 100
    const t0 = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms)
      try {
        p.setVolume(Math.round(v0 * (1 - k)))
      } catch {
        /* ничего */
      }
      if (k < 1) requestAnimationFrame(step)
      else {
        this.pause()
        p.setVolume(v0)
      }
    }
    requestAnimationFrame(step)
  }

  dispose(): void {
    try {
      this.player?.destroy()
    } catch {
      /* ничего */
    }
    this.box.remove()
  }
}

const timeout = (ms: number) => new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))
