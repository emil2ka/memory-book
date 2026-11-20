import * as THREE from 'three'

/** Внутреннее разрешение. Весь мир рисуется в него и растягивается без сглаживания. */
export const PIXEL_W = 480
export const PIXEL_H = 270

export type TickFn = (time: number, dt: number) => void

/**
 * Рендерер, камера и цикл кадров.
 * Холст всегда 480×270 пикселей, на экран растягивается целым множителем через CSS.
 */
export class PixelStage {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(32, PIXEL_W / PIXEL_H, 0.1, 100)
  private ticks = new Set<TickFn>()
  private raf = 0
  private last = 0
  private time = 0
  private ro: ResizeObserver

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(PIXEL_W, PIXEL_H, false)
    this.renderer.setClearColor(0x1b1410)
    const c = this.renderer.domElement
    c.style.imageRendering = 'pixelated'
    c.style.display = 'block'
    host.appendChild(c)

    this.camera.position.set(0, 7.2, 8.4)
    this.camera.lookAt(0, 0.2, 0)

    this.ro = new ResizeObserver(() => this.fit())
    this.ro.observe(host)
    this.fit()
  }

  /** Целый множитель, чтобы пиксели оставались квадратными и одного размера. */
  private fit() {
    const k = Math.max(1, Math.floor(Math.min(this.host.clientWidth / PIXEL_W, this.host.clientHeight / PIXEL_H)))
    const c = this.renderer.domElement
    c.style.width = `${PIXEL_W * k}px`
    c.style.height = `${PIXEL_H * k}px`
  }

  onTick(fn: TickFn) {
    this.ticks.add(fn)
    return () => this.ticks.delete(fn)
  }

  start() {
    const loop = (now: number) => {
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0
      this.last = now
      this.time += dt
      for (const fn of this.ticks) fn(this.time, dt)
      this.renderer.render(this.scene, this.camera)
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}

/** Текстура без сглаживания — для всего, что должно выглядеть пиксельным. */
export function pixelTexture(source: HTMLCanvasElement | HTMLImageElement): THREE.Texture {
  const t = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.generateMipmaps = false
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}
