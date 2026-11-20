import * as THREE from 'three'
import { HD, pixelTexture } from '../scene/PixelStage'
import { PALETTE, css } from '../scene/palette'

/** Сколько единиц мира занимает один пиксель спрайта. Один размер на всё. */
export const WORLD_PER_PX = 1 / 26

/**
 * Плоский пиксельный спрайт, всегда повёрнутый к камере.
 * Опорная точка — середина нижнего края (ноги).
 */
export class SpriteActor {
  readonly object = new THREE.Group()
  readonly mesh: THREE.Mesh
  readonly mat: THREE.MeshBasicMaterial

  constructor(
    source: HTMLCanvasElement | HTMLImageElement,
    readonly pxW: number,
    readonly pxH: number,
    /** Сколько единиц мира занимает пиксель этого спрайта. */
    readonly worldPerPx: number = WORLD_PER_PX,
  ) {
    this.mat = new THREE.MeshBasicMaterial({ map: pixelTexture(source), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })
    const geo = new THREE.PlaneGeometry(pxW * worldPerPx, pxH * worldPerPx)
    geo.translate(0, (pxH * worldPerPx) / 2, 0)
    this.mesh = new THREE.Mesh(geo, this.mat)
    if (HD) {
      // пиксельный человечек отбрасывает настоящую тень по своему силуэту
      this.mesh.castShadow = true
      this.mesh.customDistanceMaterial = new THREE.MeshDistanceMaterial({ map: this.mat.map, alphaTest: 0.5 })
      this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ map: this.mat.map, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking })
    }
    this.object.add(this.mesh)
  }

  /** Показать один кадр листа: col, row из cols×rows. */
  setFrame(col: number, row: number, cols: number, rows: number) {
    const t = this.mat.map!
    t.repeat.set(1 / cols, 1 / rows)
    t.offset.set(col / cols, 1 - (row + 1) / rows)
  }

  faceCamera(camera: THREE.Camera) {
    this.object.quaternion.copy(camera.quaternion)
  }
}

/** ЗАГЛУШКА человечка 24×32, пока нет настоящего листа. */
export function placeholderHero(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 24
  c.height = 32
  const g = c.getContext('2d')!
  const px = (color: number, x: number, y: number, w: number, h: number) => {
    g.fillStyle = css(color)
    g.fillRect(x, y, w, h)
  }
  px(PALETTE.brownDark, 7, 2, 10, 4) // волосы
  px(PALETTE.cream, 7, 5, 10, 9) // голова
  px(PALETTE.ink, 10, 9, 1, 2)
  px(PALETTE.ink, 14, 9, 1, 2)
  px(PALETTE.brick, 6, 14, 12, 3) // шарф
  px(PALETTE.brick, 16, 17, 3, 6)
  px(PALETTE.slate, 7, 17, 10, 9) // куртка
  px(PALETTE.slateDark, 5, 18, 2, 6)
  px(PALETTE.slateDark, 17, 18, 2, 6)
  px(PALETTE.navy, 8, 26, 3, 5) // ноги
  px(PALETTE.navy, 13, 26, 3, 5)
  return c
}

/** ЗАГЛУШКА предмета 16×16: цветной квадрат с буквой. */
export function placeholderItem(label: string, color: number = PALETTE.amber): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = 16
  c.height = 16
  const g = c.getContext('2d')!
  g.fillStyle = css(color)
  g.fillRect(2, 2, 12, 12)
  g.fillStyle = css(PALETTE.ink)
  g.font = '8px monospace'
  g.textAlign = 'center'
  g.fillText(label.slice(0, 2), 8, 11)
  return c
}
