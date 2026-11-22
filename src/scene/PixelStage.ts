import * as THREE from 'three'
import { PixelLayer } from '../render/PixelLayer'

/** Внутреннее разрешение. Весь мир рисуется в него и растягивается без сглаживания. */
export const PIXEL_W = 480
export const PIXEL_H = 270

/**
 * Основной вид — смешанный: реалистичный мир (полное разрешение, сглаживание, мягкие тени)
 * и пиксельные жители. Старый целиком пиксельный вид остаётся по ?look=pixel в адресе.
 */
export const HD = typeof location === 'undefined' ? false : new URLSearchParams(location.search).get('look') !== 'pixel'

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search)
/** Объёмный человечек в пиксельном слое (вариант А). ?hero=sprite — старый плоский. */
export const HERO3D = HD && params.get('hero') !== 'sprite'

export type TickFn = (time: number, dt: number) => void

/** Вертикальный угол камеры для кадра 16:9. */
const BASE_FOV = 32

/**
 * Рендерер, камера и цикл кадров.
 * Холст всегда 480×270 пикселей, на экран растягивается целым множителем через CSS.
 */
export class PixelStage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(BASE_FOV, PIXEL_W / PIXEL_H, 0.1, 100)
  /** Предел плотности пикселей холста; автокачество снижает его до 1 на слабых устройствах. */
  private maxDpr = 2
  /** Шире обычного угол обзора (вид из глаз в записи): 1 — как задумано для кадра. */
  fovScale = 1
  /** Автокачество: 0 — полное, 1 — плотность 1, 2 — ещё и тени помельче. */
  quality = 0
  private perf = { acc: 0, n: 0, warm: 0 }
  private ticks = new Set<TickFn>()
  private raf = 0
  private last = 0
  private time = 0
  private ro: ResizeObserver
  /** Пиксельный слой жителей; только в смешанном виде. */
  readonly pixel: PixelLayer | null = HD ? new PixelLayer() : null

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: HD, alpha: false, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(PIXEL_W, PIXEL_H, false)
    if (HD) {
      this.renderer.shadowMap.enabled = true
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping
      this.renderer.toneMappingExposure = 1.15
    }
    this.renderer.setClearColor(0x1b1410)
    const c = this.renderer.domElement
    if (!HD) c.style.imageRendering = 'pixelated'
    c.style.display = 'block'
    host.appendChild(c)

    this.camera.position.set(0, 7.2, 8.4)
    this.camera.lookAt(0, 0.2, 0)

    if (params.get('q') === 'low') {
      this.degrade()
      this.degrade()
    }
    if (this.pixel) {
      const d = Number(params.get('pxd'))
      const h = Number(params.get('pxh'))
      if (d > 0) this.pixel.density = d
      if (h > 0) this.pixel.fixedHeight = h
    }

    this.ro = new ResizeObserver(() => this.fit())
    this.ro.observe(host)
    // ResizeObserver молчит, пока вкладка не рисуется; resize окна — запасной путь
    window.addEventListener('resize', this.onResize)
    this.fit()
  }

  private onResize = () => this.fit()

  /** Подогнать холст и камеру под размер контейнера. */
  fit() {
    const c = this.renderer.domElement
    if (HD) {
      // кадр заполняет экран целиком: на узком (телефон стоя) ширина разворота сохраняется,
      // а сверху и снизу видно больше стола — вместо чёрных полей
      const W = Math.max(1, this.host.clientWidth)
      const H = Math.max(1, this.host.clientHeight)
      const dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr)
      this.renderer.setSize(Math.round(W * dpr), Math.round(H * dpr), false)
      c.style.width = `${W}px`
      c.style.height = `${H}px`
      this.camera.aspect = W / H
      this.applyFov()
      return
    }
    const k = Math.max(1, Math.floor(Math.min(this.host.clientWidth / PIXEL_W, this.host.clientHeight / PIXEL_H)))
    c.style.width = `${PIXEL_W * k}px`
    c.style.height = `${PIXEL_H * k}px`
  }

  /** Сменить угол обзора без пересчёта холста — для плавных переходов камеры (вход от первого лица). */
  setFovScale(s: number) {
    if (this.fovScale === s) return
    this.fovScale = s
    this.applyFov()
  }

  /** Угол обзора по аспекту экрана и fovScale (только объёмный вид). */
  private applyFov() {
    if (!HD) return
    const aspect = this.camera.aspect
    const design = PIXEL_W / PIXEL_H
    const base = Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * this.fovScale
    if (aspect >= design) this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(base))
    else {
      // стоя — чуть ближе: края страниц можно подрезать, книга крупнее
      const k = aspect < 1 ? 0.88 : 1
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((base * design * k) / aspect))
    }
    this.camera.updateProjectionMatrix()
  }

  /**
   * Если устройство не тянет (средний кадр дольше 20 мс две секунды подряд) —
   * сначала рисуем с плотностью пикселей 1 (в 4 раза меньше работы), потом мельче тени.
   * Скрытая вкладка и долгие паузы не считаются.
   */
  private watchSpeed(raw: number) {
    if (!HD || this.quality >= 2 || raw <= 0 || raw > 0.09) return
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    const p = this.perf
    if (p.warm < 1.5) {
      p.warm += raw
      return
    }
    p.acc += raw
    p.n++
    if (p.acc < 2) return
    const avg = p.acc / p.n
    p.acc = 0
    p.n = 0
    if (avg > 0.02) this.degrade()
  }

  /** Снизить качество на одну ступень. */
  degrade() {
    this.quality++
    this.perf.warm = 0
    if (this.quality === 1) {
      this.maxDpr = 1
      this.fit()
    } else if (this.quality === 2) {
      this.scene.traverse((o) => {
        const l = o as THREE.Light & { shadow?: THREE.LightShadow }
        if (!l.isLight || !l.castShadow || !l.shadow) return
        l.shadow.mapSize.set(512, 512)
        l.shadow.map?.dispose()
        l.shadow.map = null
      })
    }
    console.info(`[качество] ступень ${this.quality}`)
  }

  onTick(fn: TickFn) {
    this.ticks.add(fn)
    return () => this.ticks.delete(fn)
  }

  start() {
    const loop = (now: number) => {
      const raw = this.last ? (now - this.last) / 1000 : 0
      const dt = Math.min(0.1, raw)
      this.last = now
      this.watchSpeed(raw)
      this.time += dt
      for (const fn of this.ticks) fn(this.time, dt)
      if (this.pixel) this.pixel.render(this.renderer, this.scene, this.camera)
      else this.renderer.render(this.scene, this.camera)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    window.removeEventListener('resize', this.onResize)
    this.pixel?.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

/** Текстура без сглаживания — для всего, что должно выглядеть пиксельным. */
export function pixelTexture(source: HTMLCanvasElement | HTMLImageElement, smooth = false): THREE.Texture {
  const t = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source)
  if (!smooth) {
    t.magFilter = THREE.NearestFilter
    t.minFilter = THREE.NearestFilter
    t.generateMipmaps = false
  }
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}
