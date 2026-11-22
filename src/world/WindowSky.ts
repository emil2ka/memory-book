// Небо за окном и погода на стекле. Всё рисует код в два холста: небо (за стеклом) и стекло (капли, иней).
import * as THREE from 'three'
import type { TimeOfDay, Weather } from '../types/script'
import { makeRng } from '../timeline/rng'
import { findMaterial } from './loader'

type RGB = [number, number, number]

/** Всё, что определяет картинку неба; числа, чтобы плавно переходить от одного к другому. */
interface SkyState {
  /** Градиент сверху вниз: 4 точки. */
  stops: [RGB, RGB, RGB, RGB]
  sun: { x: number; y: number; r: number; color: RGB; a: number }
  moon: number
  stars: number
  clouds: number
  cloudTone: RGB
  rain: number
  snow: number
  fog: number
  /** Горы и крыши: тон силуэтов. */
  far: RGB
  near: RGB
  /** Огни в окнах домов напротив. */
  lights: number
  frost: number
  /** Свет из окна в комнату. */
  light: RGB
  lightI: number
}

const hex = (c: number): RGB => [(c >> 16) & 255, (c >> 8) & 255, c & 255]
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const rgba = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`

const BASE: Record<TimeOfDay, SkyState> = {
  morning: {
    stops: [hex(0x8fa9c9), hex(0xc6cfd6), hex(0xf2c9a4), hex(0xf6dcb8)],
    sun: { x: 0.22, y: 0.62, r: 0.07, color: hex(0xfff1cf), a: 0.9 },
    moon: 0, stars: 0, clouds: 0.25, cloudTone: hex(0xf6e2d0), rain: 0, snow: 0, fog: 0.1,
    far: hex(0x9aa7bd), near: hex(0x5d6680), lights: 0.1, frost: 0, light: hex(0xffe2bf), lightI: 0.55,
  },
  day: {
    stops: [hex(0x5f8fc4), hex(0x86acd3), hex(0xb9d0e3), hex(0xd8e5ea)],
    sun: { x: 0.7, y: 0.18, r: 0.06, color: hex(0xfffbea), a: 0.85 },
    moon: 0, stars: 0, clouds: 0.3, cloudTone: hex(0xfbf8f2), rain: 0, snow: 0, fog: 0,
    far: hex(0x8a9cb8), near: hex(0x4f5a70), lights: 0, frost: 0, light: hex(0xeef4ff), lightI: 0.7,
  },
  evening: {
    stops: [hex(0x2c3b58), hex(0x8a5a7c), hex(0xe0745a), hex(0xf0b35a)],
    sun: { x: 0.62, y: 0.78, r: 0.11, color: hex(0xffd08a), a: 0.95 },
    moon: 0, stars: 0.15, clouds: 0.25, cloudTone: hex(0xe7997c), rain: 0, snow: 0, fog: 0,
    far: hex(0x6b4a66), near: hex(0x2f2436), lights: 0.7, frost: 0, light: hex(0xffb070), lightI: 0.45,
  },
  night: {
    stops: [hex(0x0b1222), hex(0x131e36), hex(0x1d2a46), hex(0x2a3550)],
    sun: { x: 0.5, y: 1.2, r: 0.05, color: hex(0xffffff), a: 0 },
    moon: 1, stars: 1, clouds: 0.15, cloudTone: hex(0x3a4766), rain: 0, snow: 0, fog: 0,
    far: hex(0x1b2438), near: hex(0x0d121d), lights: 1, frost: 0, light: hex(0x8ea6d6), lightI: 0.22,
  },
}

/** Небо по времени суток и погоде. frost — иней на стекле (0..1), сверх погоды. */
export function skyFor(time: TimeOfDay, weather: Weather, frost = 0): SkyState {
  const s: SkyState = structuredClone(BASE[time] ?? BASE.day)
  const night = time === 'night'
  const grey: RGB = night ? hex(0x1c2230) : hex(0x9aa0a8)
  const dim = (k: number) => {
    s.stops = s.stops.map((c) => mix(c, grey, k)) as SkyState['stops']
    s.sun.a *= 1 - k
    s.stars *= 1 - k
    s.moon *= 1 - k * 0.8
    s.lightI *= 1 - k * 0.45
    s.light = mix(s.light, hex(0xcfd8e4), k * 0.6)
  }
  switch (weather) {
    case 'cloudy':
      dim(0.45)
      s.clouds = 0.85
      s.cloudTone = mix(s.cloudTone, night ? hex(0x2a3142) : hex(0xb9bec6), 0.6)
      break
    case 'rain':
      dim(0.65)
      s.clouds = 1
      s.cloudTone = night ? hex(0x1f2532) : hex(0x6f7682)
      s.rain = 1
      s.lights = Math.max(s.lights, night ? 1 : 0.35)
      break
    case 'snow':
      dim(0.5)
      s.stops = s.stops.map((c) => mix(c, night ? hex(0x2a3550) : hex(0xdfe6ec), 0.35)) as SkyState['stops']
      s.clouds = 0.9
      s.cloudTone = night ? hex(0x3b4762) : hex(0xd8dee6)
      s.snow = 1
      s.frost = Math.max(s.frost, 0.75)
      s.near = mix(s.near, hex(0xe3f0f5), night ? 0.25 : 0.55)
      break
    case 'fog':
      dim(0.3)
      s.fog = 0.75
      s.clouds = 0.2
      break
  }
  s.frost = Math.max(s.frost, frost)
  return s
}

function lerpState(a: SkyState, b: SkyState, k: number): SkyState {
  const n = (x: number, y: number) => x + (y - x) * k
  return {
    stops: a.stops.map((c, i) => mix(c, b.stops[i], k)) as SkyState['stops'],
    sun: { x: n(a.sun.x, b.sun.x), y: n(a.sun.y, b.sun.y), r: n(a.sun.r, b.sun.r), color: mix(a.sun.color, b.sun.color, k), a: n(a.sun.a, b.sun.a) },
    moon: n(a.moon, b.moon),
    stars: n(a.stars, b.stars),
    clouds: n(a.clouds, b.clouds),
    cloudTone: mix(a.cloudTone, b.cloudTone, k),
    rain: n(a.rain, b.rain),
    snow: n(a.snow, b.snow),
    fog: n(a.fog, b.fog),
    far: mix(a.far, b.far, k),
    near: mix(a.near, b.near, k),
    lights: n(a.lights, b.lights),
    frost: n(a.frost, b.frost),
    light: mix(a.light, b.light, k),
    lightI: n(a.lightI, b.lightI),
  }
}

const SKY = 512
const GLASS = 512

/** Небо, погода и свет из окна. Привязывается к модели окна (материалы window_sky и window_glass). */
export class WindowSky {
  readonly skyCanvas = document.createElement('canvas')
  readonly glassCanvas = document.createElement('canvas')
  readonly skyTexture: THREE.CanvasTexture
  readonly glassTexture: THREE.CanvasTexture
  /** Мягкий свет из окна в комнату; сцена может выключить или перекрасить. */
  readonly light = new THREE.DirectionalLight(0xffffff, 0.4)
  time: TimeOfDay = 'evening'
  weather: Weather = 'clear'
  private from: SkyState = skyFor('evening', 'clear')
  private to: SkyState = this.from
  private k = 1
  private fade = 1.5
  private state: SkyState = this.from
  private clock = 0
  private lastDraw = -1
  private dirty = true
  private skyline: { far: number[]; houses: { x: number; w: number; h: number; roof: number; win: [number, number, boolean][] }[]; stars: [number, number, number][]; clouds: [number, number, number, number][] }
  private drops: { x: number; y: number; r: number; v: number }[] = []
  private flakes: { x: number; y: number; r: number; v: number; s: number }[] = []

  constructor(seed = 7) {
    this.skyCanvas.width = this.skyCanvas.height = SKY
    this.glassCanvas.width = this.glassCanvas.height = GLASS
    this.skyTexture = new THREE.CanvasTexture(this.skyCanvas)
    this.skyTexture.colorSpace = THREE.SRGBColorSpace
    this.glassTexture = new THREE.CanvasTexture(this.glassCanvas)
    this.glassTexture.colorSpace = THREE.SRGBColorSpace
    const rng = makeRng(seed)
    // далёкие горы (силуэт Алатау) и дома напротив
    const far: number[] = []
    for (let i = 0; i <= 32; i++) far.push(0.5 + 0.16 * Math.sin(i * 0.55 + 1) + 0.09 * Math.sin(i * 1.7) + rng() * 0.05)
    const houses: { x: number; w: number; h: number; roof: number; win: [number, number, boolean][] }[] = []
    for (let x = -0.05; x < 1.05; ) {
      const w = 0.12 + rng() * 0.16
      const h = 0.14 + rng() * 0.2
      const win: [number, number, boolean][] = []
      for (let wy = 0.05; wy < h - 0.06; wy += 0.06) for (let wx = 0.03; wx < w - 0.03; wx += 0.05) win.push([wx, wy, rng() < 0.45])
      houses.push({ x, w, h, roof: rng() < 0.5 ? 0 : 0.04 + rng() * 0.04, win })
      x += w + rng() * 0.03
    }
    const stars: [number, number, number][] = []
    for (let i = 0; i < 90; i++) stars.push([rng(), rng() * 0.6, 0.3 + rng() * 0.7])
    const clouds: [number, number, number, number][] = []
    for (let i = 0; i < 9; i++) clouds.push([rng(), 0.08 + rng() * 0.45, 0.12 + rng() * 0.18, 0.5 + rng() * 0.5])
    this.skyline = { far, houses, stars, clouds }
    for (let i = 0; i < 70; i++) this.drops.push({ x: rng(), y: rng(), r: 2 + rng() * 5, v: 0.01 + rng() * 0.05 })
    for (let i = 0; i < 140; i++) this.flakes.push({ x: rng(), y: rng(), r: 1 + rng() * 2.4, v: 0.04 + rng() * 0.06, s: rng() * 6 })
    this.light.position.set(6, 7, -14)
    this.light.target.position.set(0, 0, 0)
    this.draw()
  }

  /** Привязать к модели окна: материалы window_sky и window_glass берут холсты кода. */
  attach(windowRoot: THREE.Object3D) {
    const sky = findMaterial(windowRoot, 'window_sky') as THREE.MeshBasicMaterial | null
    if (sky) {
      sky.map = this.skyTexture
      sky.color.set(0xffffff)
      sky.toneMapped = false
      sky.needsUpdate = true
    }
    const glass = findMaterial(windowRoot, 'window_glass') as THREE.MeshStandardMaterial | null
    if (glass) {
      glass.map = this.glassTexture
      glass.color.set(0xffffff)
      // иней и капли подсвечены небом за окном, а не только лампой
      glass.emissiveMap = this.glassTexture
      glass.emissive.set(0xffffff)
      glass.emissiveIntensity = 0.9
      glass.transparent = true
      glass.opacity = 1
      glass.depthWrite = false
      glass.needsUpdate = true
    }
    windowRoot.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const names = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.name)
      if (names.includes('window_sky') || names.includes('window_glass')) {
        mesh.castShadow = false
        mesh.receiveShadow = false
      }
    })
  }

  /** Сменить время суток и погоду; переход за fade секунд (0 — сразу). */
  set(time: TimeOfDay, weather: Weather, opts: { frost?: number; fade?: number } = {}) {
    this.time = time
    this.weather = weather
    const next = skyFor(time, weather, opts.frost ?? 0)
    this.from = this.state
    this.to = next
    this.fade = opts.fade ?? 1.5
    this.k = this.fade <= 0 ? 1 : 0
    if (this.k >= 1) this.state = next
    this.dirty = true
  }

  update(dt: number) {
    this.clock += dt
    if (this.k < 1) {
      this.k = Math.min(1, this.k + dt / this.fade)
      const e = this.k * this.k * (3 - 2 * this.k)
      this.state = lerpState(this.from, this.to, e)
      this.dirty = true
    }
    const s = this.state
    // движение: облака медленно, дождь и снег — чаще
    const fps = s.rain > 0.05 || s.snow > 0.05 ? 20 : 5
    if (this.dirty || this.clock - this.lastDraw > 1 / fps) this.draw()
  }

  private draw() {
    this.lastDraw = this.clock
    this.dirty = false
    const s = this.state
    this.light.color.setRGB(s.light[0] / 255, s.light[1] / 255, s.light[2] / 255, THREE.SRGBColorSpace)
    this.light.intensity = s.lightI
    this.drawSky(s)
    this.drawGlass(s)
    this.skyTexture.needsUpdate = true
    this.glassTexture.needsUpdate = true
  }

  private drawSky(s: SkyState) {
    const c = this.skyCanvas.getContext('2d')!
    const W = SKY
    const H = SKY
    const t = this.clock
    const g = c.createLinearGradient(0, 0, 0, H)
    g.addColorStop(0, rgba(s.stops[0]))
    g.addColorStop(0.45, rgba(s.stops[1]))
    g.addColorStop(0.78, rgba(s.stops[2]))
    g.addColorStop(1, rgba(s.stops[3]))
    c.fillStyle = g
    c.fillRect(0, 0, W, H)
    // звёзды
    if (s.stars > 0.01)
      for (const [x, y, b] of this.skyline.stars) {
        const tw = 0.6 + 0.4 * Math.sin(t * 2 + x * 40)
        c.fillStyle = `rgba(255,248,230,${s.stars * b * tw})`
        c.fillRect(x * W, y * H, 1.6, 1.6)
      }
    // солнце с ореолом
    if (s.sun.a > 0.01) {
      const sx = s.sun.x * W
      const sy = s.sun.y * H
      const r = s.sun.r * W
      const halo = c.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 5)
      halo.addColorStop(0, rgba(s.sun.color, 0.45 * s.sun.a))
      halo.addColorStop(1, rgba(s.sun.color, 0))
      c.fillStyle = halo
      c.fillRect(0, 0, W, H)
      c.fillStyle = rgba(s.sun.color, s.sun.a)
      c.beginPath()
      c.arc(sx, sy, r, 0, Math.PI * 2)
      c.fill()
    }
    // луна-серп
    if (s.moon > 0.01) {
      const mx = 0.72 * W
      const my = 0.2 * H
      const halo = c.createRadialGradient(mx, my, 10, mx, my, 70)
      halo.addColorStop(0, `rgba(220,230,255,${0.25 * s.moon})`)
      halo.addColorStop(1, 'rgba(220,230,255,0)')
      c.fillStyle = halo
      c.fillRect(0, 0, W, H)
      c.fillStyle = `rgba(246,240,220,${s.moon})`
      c.beginPath()
      c.arc(mx, my, 20, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = rgba(s.stops[0], s.moon)
      c.beginPath()
      c.arc(mx + 9, my - 6, 18, 0, Math.PI * 2)
      c.fill()
    }
    // облака: мягкие пятна, медленно плывут
    if (s.clouds > 0.01) {
      const n = Math.round(this.skyline.clouds.length * Math.min(1, s.clouds + 0.2))
      for (let i = 0; i < n; i++) {
        const [x0, y, w, a] = this.skyline.clouds[i]
        const x = (((x0 + t * 0.004 * (0.5 + a)) % 1.3) - 0.15) * W
        const cy = y * H * (0.6 + 0.4 * (1 - s.clouds))
        for (let j = 0; j < 5; j++) {
          const px = x + (j - 2) * w * W * 0.28
          const pr = w * W * (0.35 + 0.15 * Math.sin(j * 2.1 + i))
          const rg = c.createRadialGradient(px, cy, 0, px, cy, pr)
          rg.addColorStop(0, rgba(s.cloudTone, 0.55 * a * s.clouds + 0.1))
          rg.addColorStop(1, rgba(s.cloudTone, 0))
          c.fillStyle = rg
          c.fillRect(px - pr, cy - pr, pr * 2, pr * 2)
        }
      }
      if (s.clouds > 0.7) {
        c.fillStyle = rgba(s.cloudTone, (s.clouds - 0.7) * 1.2)
        c.fillRect(0, 0, W, H * 0.55)
      }
    }
    // горы
    const far = this.skyline.far
    c.fillStyle = rgba(s.far)
    c.beginPath()
    c.moveTo(0, H)
    for (let i = 0; i < far.length; i++) c.lineTo((i / (far.length - 1)) * W, H * (1 - far[i] * 0.42))
    c.lineTo(W, H)
    c.fill()
    // снежные шапки
    // шапки видны настолько, насколько светлы сами горы: ночью и в дождь почти гаснут
    const lum = (0.3 * s.far[0] + 0.59 * s.far[1] + 0.11 * s.far[2]) / 255
    c.fillStyle = rgba(mix(s.far, [240, 244, 248], 0.5), Math.min(0.85, lum * 2.2) * (1 - s.rain * 0.6))
    for (let i = 1; i < far.length - 1; i++) {
      if (far[i] < far[i - 1] || far[i] < far[i + 1] || far[i] < 0.6) continue
      const x = (i / (far.length - 1)) * W
      const y = H * (1 - far[i] * 0.42)
      c.beginPath()
      c.moveTo(x, y)
      c.lineTo(x - 12, y + 10)
      c.lineTo(x + 12, y + 10)
      c.fill()
    }
    // дымка между горами и домами
    const haze = c.createLinearGradient(0, H * 0.62, 0, H)
    haze.addColorStop(0, rgba(s.stops[3], 0))
    haze.addColorStop(1, rgba(s.stops[3], 0.55))
    c.fillStyle = haze
    c.fillRect(0, H * 0.6, W, H * 0.4)
    // дома напротив с окнами
    for (const h of this.skyline.houses) {
      const x = h.x * W
      const w = h.w * W
      const top = H * (1 - h.h)
      c.fillStyle = rgba(s.near)
      c.fillRect(x, top, w, H - top)
      if (h.roof) {
        c.beginPath()
        c.moveTo(x - 3, top)
        c.lineTo(x + w / 2, top - h.roof * H)
        c.lineTo(x + w + 3, top)
        c.fill()
        if (s.snow > 0.3) {
          c.fillStyle = `rgba(240,246,250,${0.8 * s.snow})`
          c.beginPath()
          c.moveTo(x - 3, top)
          c.lineTo(x + w / 2, top - h.roof * H)
          c.lineTo(x + w + 3, top)
          c.lineTo(x + w + 3, top + 3)
          c.lineTo(x - 3, top + 3)
          c.fill()
        }
      } else if (s.snow > 0.3) {
        c.fillStyle = `rgba(240,246,250,${0.8 * s.snow})`
        c.fillRect(x, top - 2, w, 4)
      }
      if (s.lights > 0.02)
        for (const [wx, wy, on] of h.win) {
          if (!on) continue
          c.fillStyle = `rgba(255,196,110,${s.lights * 0.9})`
          c.fillRect(x + wx * W, top + wy * H, 6, 7)
        }
    }
    // туман
    if (s.fog > 0.01) {
      const f = c.createLinearGradient(0, 0, 0, H)
      f.addColorStop(0, rgba(mix(s.stops[1], [230, 232, 236], 0.6), s.fog * 0.5))
      f.addColorStop(1, rgba(mix(s.stops[3], [236, 238, 240], 0.7), s.fog * 0.95))
      c.fillStyle = f
      c.fillRect(0, 0, W, H)
    }
    // снег за стеклом
    if (s.snow > 0.01)
      for (const f of this.flakes) {
        const y = ((f.y + t * f.v) % 1.05) * H
        const x = (f.x + 0.02 * Math.sin(t * 0.8 + f.s)) * W
        c.fillStyle = `rgba(250,252,255,${0.85 * s.snow})`
        c.beginPath()
        c.arc(x, y, f.r, 0, Math.PI * 2)
        c.fill()
      }
    // дождь за стеклом: косые штрихи
    if (s.rain > 0.01) {
      c.strokeStyle = `rgba(200,210,225,${0.35 * s.rain})`
      c.lineWidth = 1
      c.beginPath()
      for (let i = 0; i < 160; i++) {
        const hx = Math.sin(i * 127.1) * 43758.5453
        const hy = Math.sin(i * 311.7) * 24634.6345
        const x = (((hx - Math.floor(hx)) + t * 0.05) % 1) * W
        const y = (((hy - Math.floor(hy)) + t * (1.6 + (i % 5) * 0.2)) % 1) * H
        c.moveTo(x, y)
        c.lineTo(x - 4, y + 18)
      }
      c.stroke()
    }
  }

  private drawGlass(s: SkyState) {
    const c = this.glassCanvas.getContext('2d')!
    const W = GLASS
    const H = GLASS
    const t = this.clock
    c.clearRect(0, 0, W, H)
    // само стекло: лёгкий холодный налёт и блик
    c.fillStyle = 'rgba(214,228,238,0.08)'
    c.fillRect(0, 0, W, H)
    const sheen = c.createLinearGradient(0, 0, W, H)
    sheen.addColorStop(0.25, 'rgba(255,255,255,0)')
    sheen.addColorStop(0.32, 'rgba(255,255,255,0.10)')
    sheen.addColorStop(0.4, 'rgba(255,255,255,0)')
    c.fillStyle = sheen
    c.fillRect(0, 0, W, H)
    // капли: круглые, медленно сползают, с бликом
    if (s.rain > 0.01)
      for (const d of this.drops) {
        const y = ((d.y + t * d.v) % 1.1) * H
        const x = d.x * W
        const r = d.r * 0.7
        c.fillStyle = `rgba(200,214,228,${0.16 * s.rain})`
        c.fillRect(x - r * 0.18, y - r * 3, r * 0.36, r * 3)
        c.fillStyle = `rgba(170,190,212,${0.4 * s.rain})`
        c.beginPath()
        c.ellipse(x, y, r * 0.85, r, 0, 0, Math.PI * 2)
        c.fill()
        c.fillStyle = `rgba(255,255,255,${0.65 * s.rain})`
        c.beginPath()
        c.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, Math.PI * 2)
        c.fill()
      }
    // иней: растёт от углов и снизу
    if (s.frost > 0.01) {
      const corners: [number, number][] = [
        [0, H],
        [W, H],
        [0, 0],
        [W, 0],
      ]
      for (const [cx, cy] of corners) {
        const r = W * (0.3 + 0.35 * s.frost) * (cy === 0 ? 0.6 : 1)
        const rg = c.createRadialGradient(cx, cy, 0, cx, cy, r)
        rg.addColorStop(0, `rgba(240,248,252,${Math.min(1, 1.1 * s.frost)})`)
        rg.addColorStop(0.55, `rgba(226,240,248,${0.45 * s.frost})`)
        rg.addColorStop(1, 'rgba(226,240,248,0)')
        c.fillStyle = rg
        c.fillRect(0, 0, W, H)
      }
      // ветвистые иглы
      const rng = makeRng(11)
      c.strokeStyle = `rgba(250,253,255,${0.7 * s.frost})`
      c.lineWidth = 1
      c.beginPath()
      for (let i = 0; i < 70; i++) {
        const [cx, cy] = corners[i % 2]
        let x = cx + (cx === 0 ? 1 : -1) * rng() * W * 0.35 * s.frost
        let y = cy - rng() * H * 0.3 * s.frost
        let a = (cx === 0 ? -0.6 : -2.5) + (rng() - 0.5) * 1.6
        c.moveTo(x, y)
        for (let k = 0; k < 4; k++) {
          const len = 8 + rng() * 18
          x += Math.cos(a) * len
          y += Math.sin(a) * len
          c.lineTo(x, y)
          c.moveTo(x, y)
          c.lineTo(x + Math.cos(a + 0.9) * len * 0.5, y + Math.sin(a + 0.9) * len * 0.5)
          c.moveTo(x, y)
          a += (rng() - 0.5) * 0.8
        }
      }
      c.stroke()
    }
  }

  dispose() {
    this.skyTexture.dispose()
    this.glassTexture.dispose()
  }
}
