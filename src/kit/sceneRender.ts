// Предмет «как его увидят в фильме» — для проверки глазами (план 13 ③), без WebGL: на процессоре.
// Тот же buildKit, что у сцены; рядом простой человечек ростом 34 единицы; ракурс три четверти спереди-сверху,
// бумага фоном, ~100 px, ступенчатый свет и тёмный контур по силуэту, как у пиксельного слоя. На выходе PNG.
// Только для сервера и скриптов (node:zlib): api/_model.ts, eval/*.
import * as THREE from 'three'
import { deflateSync } from 'node:zlib'
import { PALETTE, type PaletteName } from '../scene/palette'
import { buildKit } from './build'
import { KIT_UNIT, type KitModel, type Part, type Vec3 } from './format'
import { fitHeight } from './sceneCheck'
import { modelBounds } from './validate'

/** Человечек для масштаба: большая голова, синяя куртка, красный шарф (как в фильме), 34 единицы. */
const HERO_PARTS: Part[] = [
  { s: 'box', p: [-2.2, 4, 0], d: [3.4, 8, 3.4], c: 'navy' },
  { s: 'box', p: [2.2, 4, 0], d: [3.4, 8, 3.4], c: 'navy' },
  { s: 'box', p: [0, 13, 0], d: [10, 10, 7], c: 'slate' },
  { s: 'box', p: [-6, 13, 0], d: [2.6, 8, 3], c: 'slate' },
  { s: 'box', p: [6, 13, 0], d: [2.6, 8, 3], c: 'slate' },
  { s: 'box', p: [0, 18.5, 0.3], d: [11, 3, 8], c: 'brick' },
  { s: 'box', p: [0, 25.5, 0], d: [13, 11, 11], c: 'skin' },
  { s: 'box', p: [0, 31.5, -0.5], d: [13.6, 4, 12], c: 'brown' },
  { s: 'box', p: [-2.6, 25.5, 5.6], d: [1.4, 2, 0.3], c: 'ink' },
  { s: 'box', p: [2.6, 25.5, 5.6], d: [1.4, 2, 0.3], c: 'ink' },
]
const HERO_H = 34
const HERO: KitModel = { id: 'look_hero', ru: 'человечек', stems: [], tags: [], hold: 'ground', parts: HERO_PARTS }

/** Высота предмета на проверке — как в фильме после страховки ④: в руке 50 % роста, место 110 %. */
export const LOOK_HEIGHT = { hand: HERO_H * 0.5, stand: HERO_H * 1.1 } as const

export interface LookOptions {
  role: 'hand' | 'stand'
  /** Ширина картинки на выходе (px); внутри рисуется в 1/scale и увеличивается без сглаживания. */
  width?: number
  /** Во сколько раз увеличить «пиксели» (как пиксельный слой фильма). */
  pixel?: number
  /** Без человечка — предмет один. */
  alone?: boolean
}

const PAPER = 0xe9d9b4
const INK = 0x1b1410

interface Tri {
  a: THREE.Vector3
  b: THREE.Vector3
  c: THREE.Vector3
  color: number
  /** 1 — человечек, 2 — предмет: контур рисуется по границе. */
  obj: number
}

function trianglesOf(group: THREE.Object3D, obj: number, out: Tri[]) {
  group.updateMatrixWorld(true)
  const L = new THREE.Vector3(0.45, 0.8, 0.55).normalize()
  group.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const g = mesh.geometry as THREE.BufferGeometry
    const pos = g.getAttribute('position')
    const idx = g.getIndex()
    const name = (mesh.userData.color ?? 'grey') as PaletteName
    const base = new THREE.Color(PALETTE[name] ?? 0x888888)
    const glow = !!mesh.userData.glow
    const n = idx ? idx.count : pos.count
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
    for (let i = 0; i < n; i += 3) {
      for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(mesh.matrixWorld)
      const nrm = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0]))
      if (nrm.lengthSq() < 1e-14) continue
      nrm.normalize()
      // ступенчатый свет: три тона, как у пиксельного слоя
      const d = Math.max(0, nrm.dot(L))
      const step = glow ? 1.15 : d > 0.66 ? 1.0 : d > 0.25 ? 0.82 : 0.64
      const c = base.clone().multiplyScalar(step)
      out.push({ a: v[0].clone(), b: v[1].clone(), c: v[2].clone(), color: (Math.min(255, Math.round(c.r * 255)) << 16) | (Math.min(255, Math.round(c.g * 255)) << 8) | Math.min(255, Math.round(c.b * 255)), obj })
    }
  })
}

/** Предмет в размере проверки: высота по роли, основание на бумаге. */
function sized(model: KitModel, role: 'hand' | 'stand'): KitModel {
  const h = LOOK_HEIGHT[role]
  return { ...model, parts: fitHeight(model.parts, h * 0.9, h * 1.1, role === 'hand' ? h * 1.3 : 60) }
}

/** Нарисовать предмет рядом с человечком. Возвращает PNG и размер. */
export function renderLook(model: KitModel, opts: LookOptions): { png: Buffer; width: number; height: number } {
  const pixel = Math.max(1, opts.pixel ?? 3)
  const W = Math.round((opts.width ?? 384) / pixel)
  const H = Math.round(W * 0.75)
  const tris: Tri[] = []
  const item = buildKit(sized(model, opts.role))
  const ib = modelBounds(sized(model, opts.role).parts)
  // место предмета, в единицах кита: в руке — справа у груди, чуть впереди; место — слева сбоку
  const at: Vec3 =
    opts.role === 'hand'
      ? [8 + ib.size[0] / 2 - (ib.min[0] + ib.max[0]) / 2, 9, 7 - (ib.min[2] + ib.max[2]) / 2]
      : [-(8 + ib.size[0] / 2) - (ib.min[0] + ib.max[0]) / 2, 0, -2 - (ib.min[2] + ib.max[2]) / 2]
  if (opts.alone) at[0] = at[1] = at[2] = 0
  item.position.set(at[0] * KIT_UNIT, at[1] * KIT_UNIT, at[2] * KIT_UNIT)
  trianglesOf(item, 2, tris)
  if (!opts.alone) trianglesOf(buildKit(HERO), 1, tris)
  // кадр: рамка всего, камера три четверти спереди-сверху
  const box = new THREE.Box3()
  for (const t of tris) box.expandByPoint(t.a).expandByPoint(t.b).expandByPoint(t.c)
  const center = box.getCenter(new THREE.Vector3())
  const radius = box.getSize(new THREE.Vector3()).length() / 2
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 100)
  const dir = new THREE.Vector3(0.35, 0.55, 1).normalize()
  cam.position.copy(center).addScaledVector(dir, (radius / Math.sin((15 * Math.PI) / 180)) * 1.08)
  cam.lookAt(center)
  cam.updateMatrixWorld(true)
  cam.updateProjectionMatrix()
  // растеризация с буфером глубины
  const color = new Uint32Array(W * H).fill(PAPER)
  const depth = new Float32Array(W * H).fill(Infinity)
  const obj = new Uint8Array(W * H)
  const p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
  for (const t of tris) {
    p[0].copy(t.a).project(cam)
    p[1].copy(t.b).project(cam)
    p[2].copy(t.c).project(cam)
    const sx = p.map((q) => ((q.x + 1) / 2) * W)
    const sy = p.map((q) => ((1 - q.y) / 2) * H)
    const area = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0])
    if (Math.abs(area) < 1e-9) continue
    const x0 = Math.max(0, Math.floor(Math.min(...sx)))
    const x1 = Math.min(W - 1, Math.ceil(Math.max(...sx)))
    const y0 = Math.max(0, Math.floor(Math.min(...sy)))
    const y1 = Math.min(H - 1, Math.ceil(Math.max(...sy)))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5
        const py = y + 0.5
        const w0 = ((sx[1] - px) * (sy[2] - py) - (sx[2] - px) * (sy[1] - py)) / area
        const w1 = ((sx[2] - px) * (sy[0] - py) - (sx[0] - px) * (sy[2] - py)) / area
        const w2 = 1 - w0 - w1
        if (w0 < 0 || w1 < 0 || w2 < 0) continue
        const z = w0 * p[0].z + w1 * p[1].z + w2 * p[2].z
        const i = y * W + x
        if (z < depth[i]) {
          depth[i] = z
          color[i] = t.color
          obj[i] = t.obj
        }
      }
    }
  }
  // тёмный контур по силуэту (граница с бумагой и между человечком и предметом)
  const out = new Uint32Array(color)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (!obj[i]) continue
      const nb = [x > 0 ? obj[i - 1] : 0, x < W - 1 ? obj[i + 1] : 0, y > 0 ? obj[i - W] : 0, y < H - 1 ? obj[i + W] : 0]
      if (nb.some((o) => o !== obj[i])) out[i] = INK
    }
  }
  // увеличить «пикселями» и закодировать
  const OW = W * pixel
  const OH = H * pixel
  const rgba = Buffer.alloc(OW * OH * 4)
  for (let y = 0; y < OH; y++) {
    for (let x = 0; x < OW; x++) {
      const c = out[Math.floor(y / pixel) * W + Math.floor(x / pixel)]
      const k = (y * OW + x) * 4
      rgba[k] = (c >> 16) & 255
      rgba[k + 1] = (c >> 8) & 255
      rgba[k + 2] = c & 255
      rgba[k + 3] = 255
    }
  }
  return { png: encodePng(OW, OH, rgba), width: OW, height: OH }
}

// ---------- PNG ----------

const CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf: Buffer) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
export function encodePng(w: number, h: number, rgba: Buffer): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
