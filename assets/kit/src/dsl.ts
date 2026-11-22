// Короткая запись кита для библиотеки. Исходники пачек пишутся на этом языке,
// `npx tsx assets/kit/build-library.ts` проверяет каждый предмет и пишет assets/kit/<категория>.json.
import type { Fx, Hold, KitModel, PaletteName, Part, Shape, Vec3 } from '../../../src/kit/format'

export type C = PaletteName
type Opt = { r?: Vec3; k?: number; glow?: boolean; n?: string }

const mk = (s: Shape) => (p: Vec3, d: Vec3, c: C, o: Opt = {}): Part => ({ s, p, d, c, ...o })
export const box = mk('box')
export const cyl = mk('cyl')
export const sph = mk('sph')
export const cone = mk('cone')
export const cap = mk('cap')
export const torus = mk('torus')
export const wedge = mk('wedge')
export const prism = mk('prism')

/** Зеркальная пара по X: сама фигура и её отражение (уши, глаза, колёса, ножки). */
export function sym(part: Part): Part[] {
  const [x, y, z] = part.p
  const r = part.r
  const m: Part = { ...part, p: [-x, y, z] }
  if (r) m.r = [r[0], -r[1], -r[2]]
  if (part.s === 'wedge') m.r = [r?.[0] ?? 0, (r ? -r[1] : 0) + 180, r ? -r[2] : 0]
  if (part.n) m.n = part.n.replace(/_r$/, '_l').replace(/_right$/, '_left')
  return [part, m]
}

/** Повторить фигуру по кругу вокруг оси Y (лепестки, спицы, лучи). */
export function ring(n: number, make: (angleDeg: number, i: number) => Part): Part[] {
  return Array.from({ length: n }, (_, i) => make((360 / n) * i, i))
}

const rad = Math.PI / 180
/** Точка на окружности в плоскости XZ (y задан). */
export const onXZ = (radius: number, deg: number, y: number): Vec3 => [Math.sin(deg * rad) * radius, y, Math.cos(deg * rad) * radius]
/** Точка на окружности в плоскости XY (лицом к камере, z задан). */
export const onXY = (radius: number, deg: number, z: number, cy = 0): Vec3 => [Math.sin(deg * rad) * radius, cy + Math.cos(deg * rad) * radius, z]

export interface Meta {
  id: string
  ru: string
  kk?: string
  en?: string
  stems: string[]
  tags: string[]
  hold: Hold
  /** Где ладонь (для hold: 'hand'), в единицах кита. */
  grip?: Vec3
  /** Роль в сценке: hand, stand (декорация места 25–60), detail (деталь 6–20). */
  scene?: 'hand' | 'stand' | 'detail'
  fx?: Fx[]
}

export const item = (meta: Meta, ...parts: (Part | Part[])[]): KitModel => ({ ...meta, parts: parts.flat(), by: 'library' })

/** Глаза-точки и румянец для зверей и персонажей-предметов: лицом к +Z. */
export function face(y: number, z: number, gap: number, opts: { eye?: number; blush?: C | null; ink?: C } = {}): Part[] {
  const e = opts.eye ?? 1.5
  const out = sym(box([gap / 2, y, z], [e, e, 1], opts.ink ?? 'ink'))
  if (opts.blush !== null) out.push(...sym(box([gap / 2 + e, y - e * 1.2, z - 0.25], [e * 1.2, e * 0.8, 1], opts.blush ?? 'coral')))
  return out
}

import { Euler, Matrix4 } from 'three'
const D = Math.PI / 180
/**
 * Поворот «сначала наклон, потом вокруг вертикали»: Ry(yaw)·Rx(tilt)·Rz(spin), переведённый в углы XYZ кита.
 * Для фигур по кругу: yaw — угол позиции onXZ, tilt > 0 — верх наклоняется наружу, лицо (+Z) смотрит наружу.
 */
export function ry(yaw: number, tilt = 0, spin = 0): Vec3 {
  const m = new Matrix4().makeRotationY(yaw * D).multiply(new Matrix4().makeRotationX(tilt * D)).multiply(new Matrix4().makeRotationZ(spin * D))
  const e = new Euler().setFromRotationMatrix(m, 'XYZ')
  return [e.x / D, e.y / D, e.z / D]
}
