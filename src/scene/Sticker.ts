import * as THREE from 'three'

/**
 * Предмет-картинка (SVG от Claude): в сцене это наклейка в полном разрешении
 * с белой вырубкой по контуру, как наклейка в дневнике. Стоит на странице
 * лицом к камере и отбрасывает тень от лампы.
 */

import { pictureFor } from '../kit/make'

const extra = new Map<string, string>()
const rastered = new Map<string, HTMLCanvasElement>()
const pending = new Map<string, Promise<HTMLCanvasElement | null>>()

/** SVG предмета по id: библиотека картинок, дорисованное Claude или добавленное для проверки. */
export function svgById(id: string): string | null {
  return extra.get(id) ?? pictureFor(id)?.svg ?? null
}

/** Добавить SVG во время работы (дорисованный Claude предмет или проверка). */
export function registerSvg(id: string, svg: string) {
  extra.set(id, svg)
  rastered.delete(id)
  pending.delete(id)
}

const SIZE = 512
const BORDER = 14

/** Растр с белой вырубкой. Готовый растр — из кэша; если ещё грузится — null. */
export function stickerCanvas(id: string): HTMLCanvasElement | null {
  return rastered.get(id) ?? null
}

/** Подготовить растр заранее (до бита). Повторный вызов не грузит второй раз. */
export function prepareSticker(id: string): Promise<HTMLCanvasElement | null> {
  const done = rastered.get(id)
  if (done) return Promise.resolve(done)
  const wait = pending.get(id)
  if (wait) return wait
  const svg = svgById(id)
  if (!svg) return Promise.resolve(null)
  const p = new Promise<HTMLCanvasElement | null>((resolve) => {
    const img = new Image()
    img.onload = () => {
      const art = document.createElement('canvas')
      art.width = art.height = SIZE
      art.getContext('2d')!.drawImage(img, 0, 0, SIZE, SIZE)
      const out = withBorder(art)
      out.userData = { art, box: drawnBox(art) }
      rastered.set(id, out)
      resolve(out)
    }
    img.onerror = () => resolve(null)
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
  pending.set(id, p)
  return p
}

/** Где на картинке нарисован предмет: [x0, y0, x1, y1] в пикселях растра. */
function drawnBox(art: HTMLCanvasElement): [number, number, number, number] {
  const { data, width, height } = art.getContext('2d')!.getImageData(0, 0, art.width, art.height)
  let x0 = width
  let y0 = height
  let x1 = 0
  let y1 = 0
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < 128) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  return x1 >= x0 ? [x0, y0, x1, y1] : [0, 0, width - 1, height - 1]
}

/** Белая вырубка: силуэт картинки, раздутый во все стороны на BORDER пикселей. */
function withBorder(art: HTMLCanvasElement): HTMLCanvasElement {
  const pad = BORDER + 2
  const c = document.createElement('canvas')
  c.width = c.height = SIZE + pad * 2
  const g = c.getContext('2d')!
  // белый силуэт
  const sil = document.createElement('canvas')
  sil.width = sil.height = SIZE
  const s = sil.getContext('2d')!
  s.drawImage(art, 0, 0)
  s.globalCompositeOperation = 'source-in'
  s.fillStyle = '#fbf6ea'
  s.fillRect(0, 0, SIZE, SIZE)
  const steps = 28
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    for (const r of [BORDER, BORDER * 0.5]) g.drawImage(sil, pad + Math.cos(a) * r, pad + Math.sin(a) * r)
  }
  g.drawImage(art, pad, pad)
  return c
}

declare global {
  interface HTMLCanvasElement {
    userData?: { art: HTMLCanvasElement; box?: [number, number, number, number] }
  }
}

/**
 * Наклейка в мире. height — рост нарисованного предмета в единицах мира (без вырубки).
 * Нижний край нарисованного стоит на y = 0 группы.
 */
export class Sticker {
  readonly object = new THREE.Group()
  readonly mesh: THREE.Mesh
  readonly width: number
  readonly height: number
  private scale: number

  constructor(readonly canvas: HTMLCanvasElement, height: number) {
    const pad = (canvas.width - SIZE) / 2
    const box = canvas.userData?.box ?? [0, 0, SIZE - 1, SIZE * 0.96]
    this.scale = height / Math.max(8, box[3] - box[1])
    this.width = canvas.width * this.scale
    this.height = canvas.height * this.scale
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.width, this.height),
      // картинка подсвечена сама по себе: в тени и против света она не должна темнеть до неузнаваемости
      new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55 }),
    )
    // нижний край нарисованного — на y = 0
    const base = pad + box[3]
    this.mesh.position.y = this.height / 2 - (canvas.height - base) * this.scale
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.object.add(this.mesh)
  }

  /** Точки картинки в мире с их цветом — куда прилетают кубики. */
  points(n: number, rand: () => number): { p: THREE.Vector3; c: THREE.Color }[] {
    const art = this.canvas.userData?.art ?? this.canvas
    const g = art.getContext('2d')!
    const { data } = g.getImageData(0, 0, art.width, art.height)
    const pad = (this.canvas.width - art.width) / 2
    this.object.updateMatrixWorld(true)
    const out: { p: THREE.Vector3; c: THREE.Color }[] = []
    let tries = 0
    while (out.length < n && tries < n * 40) {
      tries++
      const x = Math.floor(rand() * art.width)
      const y = Math.floor(rand() * art.height)
      const i = (y * art.width + x) * 4
      if (data[i + 3] < 200) continue
      const lx = (x + pad) * this.scale - this.width / 2
      const ly = this.height / 2 - (y + pad) * this.scale
      const p = new THREE.Vector3(lx, ly, 0).applyMatrix4(this.mesh.matrixWorld)
      const c = new THREE.Color().setRGB(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, THREE.LinearSRGBColorSpace)
      out.push({ p, c })
    }
    return out
  }
}
