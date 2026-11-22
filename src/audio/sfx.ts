// Звуки действий фильма. Все синтезируются WebAudio прямо здесь — без чужих файлов.
// Тихие и короткие: песня дня остаётся главной.

type Ctx = AudioContext

let ctx: Ctx | null = null
let master: GainNode | null = null
let noiseBuf: AudioBuffer | null = null

function audio(): { ctx: Ctx; out: GainNode; noise: AudioBuffer } | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!C) return null
    ctx = new C()
    master = ctx.createGain()
    master.gain.value = 0.32
    master.connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  if (ctx.state === 'suspended') void ctx.resume()
  if (ctx.state !== 'running') return null
  return { ctx, out: master!, noise: noiseBuf! }
}

/** Отрезок шума через фильтр с огибающей. */
function noise(at: number, dur: number, opts: { type?: BiquadFilterType; f0: number; f1?: number; q?: number; gain: number; attack?: number }) {
  const a = audio()
  if (!a) return
  const t = a.ctx.currentTime + at
  const src = a.ctx.createBufferSource()
  src.buffer = a.noise
  src.playbackRate.value = 0.8 + Math.random() * 0.4
  const f = a.ctx.createBiquadFilter()
  f.type = opts.type ?? 'bandpass'
  f.Q.value = opts.q ?? 1
  f.frequency.setValueAtTime(opts.f0, t)
  if (opts.f1) f.frequency.exponentialRampToValueAtTime(opts.f1, t + dur)
  const g = a.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(opts.gain, t + (opts.attack ?? 0.01))
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(a.out)
  src.start(t, Math.random() * 0.5, dur + 0.05)
}

/** Короткий тон с падением высоты. */
function tone(at: number, dur: number, f0: number, f1: number, gain: number, type: OscillatorType = 'sine') {
  const a = audio()
  if (!a) return
  const t = a.ctx.currentTime + at
  const o = a.ctx.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(f0, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
  const g = a.ctx.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

export const sfx = {
  /** Разбудить звук после жеста пользователя (кнопка «Смотреть»). */
  unlock() {
    audio()
  },
  /** Слово отклеивается от бумаги: шуршащий надрыв. */
  peel(dur = 0.5) {
    for (let i = 0; i < 4; i++) noise(i * dur * 0.18, dur * 0.3, { f0: 2400 + i * 500, f1: 5200, q: 2.5, gain: 0.35 })
  },
  /** Буквы рассыпаются на кубики и собираются: россыпь щелчков. */
  cubes(dur = 1) {
    for (let i = 0; i < 18; i++) {
      const at = Math.pow(i / 18, 0.8) * dur * 0.8
      tone(at, 0.05, 1400 + Math.random() * 1600, 700, 0.12, 'triangle')
    }
  },
  /** Предмет появился: мягкий «чпок». */
  pop() {
    tone(0, 0.16, 520, 180, 0.5)
    noise(0, 0.08, { f0: 1800, q: 1, gain: 0.15 })
  },
  /** Шаг по бумаге. */
  step() {
    noise(0, 0.05, { type: 'lowpass', f0: 900, q: 0.7, gain: 0.18 })
  },
  /** Снимок выезжает из книги. */
  slide(dur = 0.4) {
    noise(0, dur, { f0: 900, f1: 2600, q: 0.8, gain: 0.22, attack: 0.06 })
  },
  /** Встряхивание снимка. */
  shake(n = 6, every = 0.11) {
    for (let i = 0; i < n; i++) noise(i * every, 0.07, { f0: 3000, q: 1.5, gain: 0.2 })
  },
  /** Снимок проявился: тихий колокольчик. */
  chime() {
    tone(0, 0.9, 1318, 1310, 0.12)
    tone(0.08, 1.1, 1976, 1970, 0.07)
  },
  /** Книга закрылась. */
  thump() {
    tone(0, 0.3, 110, 50, 0.7)
    noise(0, 0.18, { type: 'lowpass', f0: 600, q: 0.6, gain: 0.35 })
  },
  /** Страница перелистнулась. */
  flip() {
    noise(0, 0.35, { f0: 1500, f1: 4200, q: 0.9, gain: 0.25, attack: 0.05 })
  },
  /** Перо коснулось бумаги и повело штрих: очень тихое шуршание. */
  scratch(dur = 0.1) {
    noise(0, dur, { type: 'highpass', f0: 3800, f1: 5200, q: 0.7, gain: 0.05, attack: 0.008 })
  },
  /** Искры, снежинки, звёздочки. */
  sparkle() {
    for (let i = 0; i < 5; i++) tone(i * 0.07, 0.2, 2200 + i * 330, 2100 + i * 330, 0.05)
  },
}
