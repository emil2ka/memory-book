import * as THREE from 'three'
import { LAYER_PIX } from '../render/PixelLayer'
import { KIT_UNIT } from '../kit/format'
import { PALETTE, type PaletteName } from './palette'

/** Эффекты, которые умеет пиксельный слой. Имена совпадают с catalog.effects. */
export type EffectKind = 'leaves' | 'snow' | 'rain' | 'steam' | 'frost' | 'sparkles'

const raw = (c: PaletteName) => {
  const h = PALETTE[c]
  return new THREE.Color().setRGB(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255, THREE.LinearSRGBColorSpace)
}

interface Spec {
  n: number
  geo: () => THREE.BufferGeometry
  colors: PaletteName[]
}

const U = KIT_UNIT
const SPECS: Record<EffectKind, Spec> = {
  leaves: { n: 28, geo: () => new THREE.BoxGeometry(2.6 * U, 0.5 * U, 1.8 * U), colors: ['amber', 'ochre', 'brick', 'coral', 'yellow'] },
  snow: { n: 40, geo: () => new THREE.BoxGeometry(1.1 * U, 1.1 * U, 1.1 * U), colors: ['white', 'frost', 'ice'] },
  rain: { n: 46, geo: () => new THREE.BoxGeometry(0.45 * U, 3.2 * U, 0.45 * U), colors: ['greyBlue', 'ice'] },
  steam: { n: 10, geo: () => new THREE.SphereGeometry(1.1 * U, 8, 6), colors: ['white', 'cream'] },
  frost: { n: 44, geo: () => new THREE.ConeGeometry(0.9 * U, 4.2 * U, 4), colors: ['ice', 'frost', 'white', 'greyBlue'] },
  sparkles: { n: 16, geo: () => new THREE.BoxGeometry(1 * U, 1 * U, 1 * U), colors: ['yellow', 'white', 'amber'] },
}

const ease = (k: number) => {
  const x = Math.min(1, Math.max(0, k))
  return x * x * (3 - 2 * x)
}

/**
 * Один всплеск эффекта: набор частиц в пиксельном слое. Положение каждой частицы —
 * чистая функция времени фильма, поэтому перемотка работает без накопления состояния.
 */
export class EffectBurst {
  readonly mesh: THREE.InstancedMesh
  private p: { x: number; z: number; y: number; d: number; ph: number; sp: number; yaw: number; s: number }[] = []
  private m = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private e = new THREE.Euler()
  private v = new THREE.Vector3()
  private sc = new THREE.Vector3()
  private at = new THREE.Vector3()

  constructor(
    readonly kind: EffectKind,
    /** Точка или предмет, от которого идёт эффект (пар идёт за кружкой). */
    private origin: THREE.Vector3 | THREE.Object3D,
    private t0: number,
    /** Разворот: x от −w до w, z от −h до h, y — поверхность страницы. */
    private area: { w: number; h: number; y: number },
    rand: () => number,
  ) {
    const spec = SPECS[kind]
    this.mesh = new THREE.InstancedMesh(spec.geo(), new THREE.MeshBasicMaterial({ toneMapped: false }), spec.n)
    this.mesh.layers.set(LAYER_PIX)
    this.mesh.frustumCulled = false
    this.mesh.castShadow = kind !== 'rain' && kind !== 'steam'
    for (let i = 0; i < spec.n; i++) {
      this.mesh.setColorAt(i, raw(spec.colors[Math.floor(rand() * spec.colors.length)]))
      let x = (rand() * 2 - 1) * area.w
      let z = (rand() * 2 - 1) * area.h
      if (kind === 'frost') {
        // по периметру разворота, кустиками у краёв
        const side = i % 4
        const k = rand() * 2 - 1
        x = side < 2 ? k * area.w : (side === 2 ? -1 : 1) * area.w * (0.93 + rand() * 0.05)
        z = side < 2 ? (side === 0 ? -1 : 1) * area.h * (0.92 + rand() * 0.06) : k * area.h
      }
      this.p.push({ x, z, y: 1.6 + rand() * 1.0, d: rand(), ph: rand(), sp: 0.7 + rand() * 0.6, yaw: rand() * Math.PI * 2, s: 0.7 + rand() * 0.6 })
    }
    this.mesh.count = spec.n
  }

  private originPos() {
    if (this.origin instanceof THREE.Object3D) return this.origin.getWorldPosition(this.at)
    return this.at.copy(this.origin)
  }

  update(time: number, hidden: boolean) {
    const age = time - this.t0
    this.mesh.visible = !hidden && age >= 0
    if (!this.mesh.visible) return
    const o = this.originPos()
    const y0 = this.area.y
    for (let i = 0; i < this.p.length; i++) {
      const p = this.p[i]
      let x = p.x
      let y = y0
      let z = p.z
      let s = p.s
      this.e.set(0, p.yaw, 0)
      switch (this.kind) {
        case 'leaves': {
          // каждый лист падает один раз, кружась, и остаётся лежать на странице
          const k = ease((age - p.d * 3.2) / (2.4 / p.sp))
          if (age < p.d * 3.2) s = 0
          y = y0 + 0.01 + (1 - k) * p.y
          x += Math.sin(k * 6 + p.ph * 6) * 0.25 * (1 - k)
          this.e.set((1 - k) * (age * 3 + p.ph * 9), p.yaw + (1 - k) * age * 2, (1 - k) * Math.sin(age * 4 + p.ph) * 0.8)
          break
        }
        case 'snow': {
          // три волны снегопада, снежинки ложатся на бумагу
          const cyc = (age * 0.32 * p.sp + p.ph) % 1
          const wave = Math.floor(age * 0.32 * p.sp + p.ph)
          const k = cyc
          if (wave > 2) {
            y = y0 + 0.01
          } else {
            y = y0 + (1 - k) * p.y
            x += Math.sin(age * 1.7 + p.ph * 7) * 0.12
          }
          break
        }
        case 'rain': {
          const k = (age * 1.4 * p.sp + p.ph) % 1
          const wave = Math.floor(age * 1.4 * p.sp + p.ph)
          y = y0 + (1 - k) * (p.y + 0.4) + 0.06
          if (wave > 6) s = 0
          break
        }
        case 'steam': {
          const k = (age * 0.55 + p.ph) % 1
          x = o.x + Math.sin(k * 5 + p.ph * 9) * 0.06
          z = o.z + (p.d - 0.5) * 0.08
          y = o.y + 0.05 + k * 0.55
          s = Math.sin(k * Math.PI) * p.s
          break
        }
        case 'frost': {
          // иней растёт от краёв к середине, кристаллы торчат вкось
          const k = ease((age - p.d * 1.6) / 1.1)
          s = k * p.s * 1.2
          y = y0 + 0.02
          this.e.set((p.ph - 0.5) * 1.1, p.yaw, (p.d - 0.5) * 1.1)
          break
        }
        case 'sparkles': {
          const r = 0.25 + p.d * 0.45
          x = o.x + Math.cos(p.yaw) * r
          z = o.z + Math.sin(p.yaw) * r * 0.6
          y = o.y + 0.15 + p.ph * 0.7 + Math.sin(age * 2 + p.ph * 6) * 0.05
          const tw = Math.sin((age * 2.6 + p.ph) * Math.PI * 2)
          s = Math.max(0, tw) * p.s * (age > 4 ? Math.max(0, 1 - (age - 4) / 1.5) : 1)
          this.e.set(age * 2, age * 3 + p.yaw, 0)
          break
        }
      }
      this.q.setFromEuler(this.e)
      this.sc.setScalar(Math.max(0.0001, s))
      this.m.compose(this.v.set(x, y, z), this.q, this.sc)
      this.mesh.setMatrixAt(i, this.m)
    }
    this.mesh.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
  }
}
