import * as THREE from 'three'
import type { KitModel } from '../kit/format'
import { PALETTE, type PaletteName } from './palette'
import { LAYER_PIX } from '../render/PixelLayer'

/** Запасной предмет, если слова нет в библиотеке и дорисовать не вышло: светящийся кристалл. */
export const CRYSTAL: KitModel = {
  id: 'crystal',
  ru: 'кристалл',
  stems: [],
  tags: ['feeling'],
  hold: 'hand',
  fx: [{ kind: 'sparkle', at: [0, 12, 0] }],
  parts: [
    { s: 'cone', p: [0, 8.5, 0], d: [6, 7, 6], c: 'ice', k: 6, glow: true },
    { s: 'cone', p: [0, 3.5, 0], d: [6, 5, 6], r: [180, 0, 0], c: 'greyBlue', k: 6 },
    { s: 'cone', p: [2.6, 4.5, 1.2], d: [2.6, 4, 2.6], r: [0, 0, -25], c: 'frost', k: 5, glow: true },
  ],
}

/** Слово как настоящие чернила: плоскость с буквами, лежит на странице ровно поверх текста. */
export function inkWord(canvas: HTMLCanvasElement, w: number, h: number): THREE.Mesh {
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const geo = new THREE.PlaneGeometry(w, h, 16, 1)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ map: tex, transparent: false, alphaTest: 0.35, side: THREE.DoubleSide }),
  )
  mesh.castShadow = true
  mesh.userData.canvas = canvas
  return mesh
}

/** Точки букв: где на холсте слова есть чернила. Возвращает координаты в плоскости слова (−w/2..w/2, −h/2..h/2). */
export function letterPoints(canvas: HTMLCanvasElement, w: number, h: number, max = 140): THREE.Vector2[] {
  const g = canvas.getContext('2d')!
  const { width: W, height: H } = canvas
  const data = g.getImageData(0, 0, W, H).data
  const step = Math.max(2, Math.round(Math.sqrt((W * H) / (max * 6))))
  const pts: THREE.Vector2[] = []
  for (let y = 0; y < H; y += step)
    for (let x = 0; x < W; x += step) {
      if (data[(y * W + x) * 4 + 3] > 128) pts.push(new THREE.Vector2((x / W - 0.5) * w, (0.5 - y / H) * h))
    }
  // слишком много — прореживаем равномерно
  if (pts.length > max) {
    const k = pts.length / max
    return Array.from({ length: max }, (_, i) => pts[Math.floor(i * k)])
  }
  return pts
}

/** Точки внутри предмета в мировых координатах с цветом фигуры — куда прилетают кубики. */
export function objectPoints(obj: THREE.Object3D, n: number, rand: () => number): { p: THREE.Vector3; c: PaletteName }[] {
  obj.updateMatrixWorld(true)
  const parts: { mesh: THREE.Mesh; vol: number }[] = []
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || !m.userData.color) return
    const s = new THREE.Vector3()
    m.getWorldScale(s)
    parts.push({ mesh: m, vol: Math.max(1e-6, Math.abs(s.x * s.y * s.z)) })
  })
  if (!parts.length) return []
  const total = parts.reduce((a, b) => a + Math.cbrt(b.vol), 0)
  const out: { p: THREE.Vector3; c: PaletteName }[] = []
  for (let i = 0; i < n; i++) {
    // крупные фигуры получают больше кубиков, но мелкие (глаза, ручки) тоже не пропадают
    let r = rand() * total
    let part = parts[0]
    for (const p of parts) {
      r -= Math.cbrt(p.vol)
      if (r <= 0) {
        part = p
        break
      }
    }
    // точка внутри единичной фигуры → в мир
    const local = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.8)
    out.push({ p: local.applyMatrix4(part.mesh.matrixWorld), c: part.mesh.userData.color as PaletteName })
  }
  return out
}

const raw = (c: PaletteName) => {
  const h = PALETTE[c]
  return new THREE.Color().setRGB(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255, THREE.LinearSRGBColorSpace)
}

const ease = (k: number) => {
  const x = Math.min(1, Math.max(0, k))
  return x * x * (3 - 2 * x)
}

/**
 * Кубики: буквы рассыпаются на пиксельные кубики, кубики летят и собираются в предмет.
 * update(u): u от 0 до 1 — доля превращения.
 */
export class CubeSwarm {
  readonly mesh: THREE.InstancedMesh
  private from: THREE.Vector3[]
  private kick: THREE.Vector3[]
  private to: { p: THREE.Vector3; c: PaletteName | THREE.Color }[]
  private delay: number[]
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private s = new THREE.Vector3()
  private v = new THREE.Vector3()
  private ink = raw('navy')

  constructor(from: THREE.Vector3[], to: { p: THREE.Vector3; c: PaletteName | THREE.Color }[], size: number, rand: () => number) {
    const n = Math.min(from.length, to.length)
    this.from = from.slice(0, n)
    this.to = to.slice(0, n)
    this.kick = this.from.map(() => new THREE.Vector3(rand() - 0.5, rand() * 0.8 + 0.2, rand() - 0.5).multiplyScalar(0.35))
    this.delay = this.from.map(() => rand() * 0.25)
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ toneMapped: false }), Math.max(1, n))
    this.mesh.count = n
    this.mesh.frustumCulled = false
    this.mesh.layers.set(LAYER_PIX)
    this.mesh.castShadow = true
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, this.ink)
  }

  update(u: number) {
    const n = this.mesh.count
    for (let i = 0; i < n; i++) {
      const d = this.delay[i]
      // 0..0.25 — взрыв от букв; потом полёт по дуге к своей точке предмета
      const burst = ease(u / 0.25)
      const fly = ease((u - 0.2 - d) / 0.5)
      const a = this.v.copy(this.from[i]).addScaledVector(this.kick[i], burst)
      const b = this.to[i].p
      const lift = Math.sin(fly * Math.PI) * 0.35
      const p = a.lerp(b, fly)
      p.y += lift
      const arrived = fly >= 1
      const scale = arrived ? Math.max(0, 1 - (u - 0.2 - d - 0.5) / 0.15) : u < 0.03 ? u / 0.03 : 1
      this.s.setScalar(Math.max(0.0001, scale))
      this.q.setFromAxisAngle(this.kick[i].clone().normalize(), (1 - fly) * u * 12)
      this.m.compose(p, this.q, this.s)
      this.mesh.setMatrixAt(i, this.m)
      if (fly > 0.5) {
        const c = this.to[i].c
        this.mesh.setColorAt(i, c instanceof THREE.Color ? c : raw(c))
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}

/** Детерминированный генератор по строке: один и тот же день выглядит одинаково. */
export function rngFrom(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  let s = h >>> 0 || 1
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 4294967296
  }
}
