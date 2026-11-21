import * as THREE from 'three'
import { PALETTE } from '../scene/palette'
import { KIT_UNIT, type KitModel, type PaletteName, type Part } from './format'

/** Материал для фигуры. Пиксельный слой подставляет свой ступенчатый; по умолчанию — Ламберт. */
export type MaterialFor = (c: PaletteName, glow: boolean) => THREE.Material

const lambert = new Map<string, THREE.Material>()
export const lambertFor: MaterialFor = (c, glow) => {
  const key = `${c}:${glow}`
  let m = lambert.get(key)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: PALETTE[c], emissive: glow ? PALETTE[c] : 0x000000, emissiveIntensity: glow ? 0.8 : 0 })
    lambert.set(key, m)
  }
  return m
}

const geos = new Map<string, THREE.BufferGeometry>()
const cached = (key: string, make: () => THREE.BufferGeometry) => {
  let g = geos.get(key)
  if (!g) {
    g = make()
    geos.set(key, g)
  }
  return g
}

const seg = (k: number | undefined, def: number) => Math.max(3, Math.min(24, Math.round(k ?? def)))
const r2 = (x: number) => Math.round(x * 50) / 50

/** Треугольная призма: сечение по XY из трёх точек, вытянута по Z от −0.5 до 0.5. */
function prismGeometry(a: [number, number], b: [number, number], c: [number, number]) {
  const shape = new THREE.Shape([new THREE.Vector2(...a), new THREE.Vector2(...b), new THREE.Vector2(...c)])
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false })
  g.translate(0, 0, -0.5)
  return g
}

/**
 * Единичная геометрия фигуры и масштаб, который превращает её в нужные габариты.
 * Геометрии общие для всех предметов, поэтому сотни предметов стоят дёшево.
 */
function shapeOf(part: Part): { geo: THREE.BufferGeometry; scale: THREE.Vector3 } {
  const [w, h, d] = part.d
  switch (part.s) {
    case 'box':
      return { geo: cached('box', () => new THREE.BoxGeometry(1, 1, 1)), scale: new THREE.Vector3(w, h, d) }
    case 'cyl': {
      const k = seg(part.k, 14)
      return { geo: cached(`cyl${k}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, k)), scale: new THREE.Vector3(w, h, d) }
    }
    case 'cone': {
      const k = seg(part.k, 14)
      // у пирамиды грань, а не ребро смотрит в камеру
      return { geo: cached(`cone${k}`, () => new THREE.ConeGeometry(0.5, 1, k, 1, false, k === 4 ? Math.PI / 4 : 0)), scale: new THREE.Vector3(w, h, d) }
    }
    case 'sph': {
      const k = seg(part.k, 14)
      return { geo: cached(`sph${k}`, () => new THREE.SphereGeometry(0.5, k, Math.max(4, Math.round(k * 0.7)))), scale: new THREE.Vector3(w, h, d) }
    }
    case 'cap': {
      // капсула: полукруглые концы не растягиваются — геометрия под отношение длины к диаметру
      const ratio = r2(Math.max(1, h / Math.max(w, 0.01)))
      return {
        geo: cached(`cap${ratio}`, () => new THREE.CapsuleGeometry(0.5, ratio - 1, 4, 12)),
        scale: new THREE.Vector3(w, w, d),
      }
    }
    case 'torus': {
      const t = r2(Math.min(0.9, Math.max(0.05, d / Math.max(w, 0.01))))
      return {
        geo: cached(`torus${t}`, () => new THREE.TorusGeometry(0.5 - t / 2, t / 2, 8, 18)),
        scale: new THREE.Vector3(w, h, w),
      }
    }
    case 'wedge':
      return { geo: cached('wedge', () => prismGeometry([-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5])), scale: new THREE.Vector3(w, h, d) }
    case 'prism':
      return { geo: cached('prism', () => prismGeometry([-0.5, -0.5], [0.5, -0.5], [0, 0.5])), scale: new THREE.Vector3(w, h, d) }
  }
}

const DEG = Math.PI / 180

/**
 * Собрать предмет из кита. Возвращает группу в мировых единицах: основание на y = 0,
 * центр по X и Z — как задано в ките. Каждая фигура — отдельный меш с userData.part.
 */
export function buildKit(model: KitModel, mat: MaterialFor = lambertFor): THREE.Group {
  const group = new THREE.Group()
  group.name = model.id
  const inner = new THREE.Group()
  inner.scale.setScalar(KIT_UNIT)
  group.add(inner)
  for (const part of model.parts) {
    const { geo, scale } = shapeOf(part)
    const mesh = new THREE.Mesh(geo, mat(part.c, !!part.glow))
    mesh.position.set(...part.p)
    if (part.r) mesh.rotation.set(part.r[0] * DEG, part.r[1] * DEG, part.r[2] * DEG)
    mesh.scale.copy(scale)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.part = part.n ?? null
    mesh.userData.color = part.c
    mesh.userData.glow = !!part.glow
    inner.add(mesh)
  }
  group.userData.kit = model
  return group
}

/** Габариты предмета в единицах кита (для подписи и проверки высоты). */
export function kitBounds(model: KitModel): THREE.Box3 {
  const box = new THREE.Box3()
  const g = buildKit(model)
  g.scale.setScalar(1 / KIT_UNIT)
  g.updateMatrixWorld(true)
  box.setFromObject(g)
  return box
}
