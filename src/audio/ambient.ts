// Тихая фоновая музыка приложения (Эмиль, 22.11): играет на полке и во время записи, уходит, когда начинается фильм
// (у фильма своя песня). Трек — «Traveling in your mind», Loyalty Freak Music, CC0 1.0 (public/ambient.mp3).
// Браузеры не дают звуку стартовать без жеста — музыка включается при первом клике или нажатии клавиши.

const KEY = 'memory-book.ambient'
const VOLUME = 0.32

class Ambient {
  private audio: HTMLAudioElement | null = null
  private want = false
  private unlocked = false
  private fadeRaf = 0
  private listeners = new Set<(on: boolean) => void>()
  enabled = true

  constructor() {
    try {
      this.enabled = localStorage.getItem(KEY) !== 'off'
    } catch {
      /* нет хранилища — музыка по умолчанию включена */
    }
    if (typeof window === 'undefined') return
    const unlock = () => {
      this.unlocked = true
      this.apply()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    document.addEventListener('visibilitychange', () => this.apply())
  }

  private el() {
    if (!this.audio) {
      this.audio = new Audio('/ambient.mp3')
      this.audio.loop = true
      this.audio.preload = 'auto'
      this.audio.volume = 0
    }
    return this.audio
  }

  /** Должна ли музыка звучать сейчас (полка, запись — да; фильм — нет). */
  setWanted(on: boolean) {
    if (this.want === on) return
    this.want = on
    this.apply()
  }

  setEnabled(on: boolean) {
    this.enabled = on
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off')
    } catch {
      /* не страшно */
    }
    this.apply()
    for (const fn of this.listeners) fn(on)
  }

  onChange(fn: (on: boolean) => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private apply() {
    const play = this.enabled && this.want && this.unlocked && document.visibilityState === 'visible'
    if (!play && !this.audio) return
    const a = this.el()
    if (play && a.paused) a.play().catch(() => {})
    this.fade(play ? VOLUME : 0, play ? 1600 : 900, () => {
      if (!play) a.pause()
    })
  }

  private fade(to: number, ms: number, done?: () => void) {
    const a = this.el()
    cancelAnimationFrame(this.fadeRaf)
    const from = a.volume
    const t0 = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / ms)
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k))
      if (k < 1) this.fadeRaf = requestAnimationFrame(step)
      else done?.()
    }
    this.fadeRaf = requestAnimationFrame(step)
  }
}

export const ambient = new Ambient()
