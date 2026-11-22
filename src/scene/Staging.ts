import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { KIT_UNIT } from '../kit/format'
import { LAYER_PIX, toonFor } from '../render/PixelLayer'

/**
 * Противоречие дня — два состояния в одном кадре (02-style-bible, «Противоречие»).
 * Здесь — то, из чего его собирает сцена: пятна света и инея на бумаге и толпа силуэтов.
 */

const plane = (w: number, h: number, tex: THREE.Texture, additive: boolean) => {
  const geo = new THREE.PlaneGeometry(w, h)
  geo.rotateX(-Math.PI / 2)
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    opacity: 0,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  })
  const m = new THREE.Mesh(geo, mat)
  m.renderOrder = 2
  return m
}

const texOf = (c: HTMLCanvasElement) => {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/** Тёплое пятно света на бумаге вокруг человечка. */
export function warmPool(radius: number, color = 'rgba(255, 196, 92,'): THREE.Mesh {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128)
  gr.addColorStop(0, `${color} 0.5)`)
  gr.addColorStop(0.45, `${color} 0.25)`)
  gr.addColorStop(1, `${color} 0)`)
  g.fillStyle = gr
  g.fillRect(0, 0, 256, 256)
  return plane(radius * 2, radius * 2, texOf(c), true)
}

/** Иней по краям разворота: густой у краёв, с кристаллическими штрихами, к центру исчезает. */
export function frostEdges(w: number, h: number, rand: () => number): THREE.Mesh {
  const W = 640
  const H = Math.round((W * h) / w)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  const img = g.createImageData(W, H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.min(x / W, 1 - x / W, (y / H) * (h / w), (1 - y / H) * (h / w)) / 0.16
      const k = Math.max(0, 1 - d)
      const a = Math.pow(k, 1.6) * (0.55 + 0.45 * rand())
      const i = (y * W + x) * 4
      img.data[i] = 214
      img.data[i + 1] = 234
      img.data[i + 2] = 248
      img.data[i + 3] = Math.round(Math.min(1, a * 1.25) * 235)
    }
  g.putImageData(img, 0, 0)
  // ветки инея от краёв внутрь
  g.strokeStyle = 'rgba(251, 253, 255, 0.85)'
  g.lineCap = 'round'
  const fern = (x: number, y: number, a: number, len: number, depth: number) => {
    if (depth <= 0 || len < 3) return
    const x2 = x + Math.cos(a) * len
    const y2 = y + Math.sin(a) * len
    g.lineWidth = Math.max(0.6, depth * 0.7)
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x2, y2)
    g.stroke()
    fern(x2, y2, a + 0.5 + rand() * 0.3, len * 0.62, depth - 1)
    fern(x2, y2, a - 0.5 - rand() * 0.3, len * 0.62, depth - 1)
    fern(x2, y2, a + (rand() - 0.5) * 0.3, len * 0.7, depth - 1)
  }
  for (let i = 0; i < 46; i++) {
    const side = i % 4
    const t = rand()
    const [x, y, a] =
      side === 0 ? [t * W, 0, Math.PI / 2] : side === 1 ? [t * W, H, -Math.PI / 2] : side === 2 ? [0, t * H, 0] : [W, t * H, Math.PI]
    fern(x, y, a + (rand() - 0.5) * 0.8, 14 + rand() * 26, 4)
  }
  return plane(w, h, texOf(c), false)
}

/**
 * Толпа силуэтов вокруг человечка: n фигурок по кольцу, в пиксельном слое.
 * update(k, time): k — сколько толпы уже пришло (0..1).
 */
export class Crowd {
  readonly mesh: THREE.InstancedMesh
  private spots: { x: number; z: number; s: number; ph: number; d: number }[] = []
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private v = new THREE.Vector3()
  private sc = new THREE.Vector3()
  private y: number

  constructor(center: THREE.Vector3, bounds: { x0: number; x1: number; z0: number; z1: number }, rand: () => number, n = 42) {
    const body = new THREE.CapsuleGeometry(3.3, 9, 4, 10)
    body.translate(0, 7.8, 0)
    const head = new THREE.SphereGeometry(4.4, 12, 9)
    head.translate(0, 19.6, 0)
    const geo = mergeGeometries([body, head])!
    geo.scale(KIT_UNIT, KIT_UNIT, KIT_UNIT)
    this.mesh = new THREE.InstancedMesh(geo, toonFor('slate'), n)
    this.mesh.layers.set(LAYER_PIX)
    this.mesh.castShadow = true
    this.mesh.receiveShadow = true
    this.mesh.frustumCulled = false
    let tries = 0
    while (this.spots.length < n && tries < n * 30) {
      tries++
      const a = rand() * Math.PI * 2
      const r = 1.15 + rand() * 1.3
      const x = center.x + Math.cos(a) * r
      const z = center.z + Math.sin(a) * r * 0.8
      if (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1) continue
      // перед человечком (со стороны камеры) толпа не стоит — его должно быть видно
      if (z > center.z + 0.25 && Math.abs(x - center.x) < 1.0) continue
      this.spots.push({ x, z, s: 0.62 + rand() * 0.25, ph: rand() * 6.28, d: rand() })
    }
    this.mesh.count = this.spots.length
    this.y = center.y
  }

  update(k: number, time: number) {
    for (let i = 0; i < this.spots.length; i++) {
      const p = this.spots[i]
      const a = Math.min(1, Math.max(0, (k - p.d * 0.5) / 0.3))
      const s = a * p.s
      // толпа суетится: подпрыгивает и покачивается
      const bob = Math.abs(Math.sin(time * 7 + p.ph)) * 0.04
      this.v.set(p.x + Math.sin(time * 2.3 + p.ph) * 0.04, this.y + bob, p.z)
      this.q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.sin(time * 5 + p.ph) * 0.08)
      this.sc.setScalar(Math.max(0.0001, s))
      this.m.compose(this.v, this.q, this.sc)
      this.mesh.setMatrixAt(i, this.m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }
}
