import * as THREE from 'three'
import { buildKit, type MaterialFor } from '../kit/build'
import { KIT_UNIT, type KitModel, type PaletteName, type Part } from '../kit/format'
import { toonFor, toPixelLayer } from '../render/PixelLayer'

/** Цвета человечка. Второй персонаж — та же фигура в других цветах. */
export interface HeroColors {
  skin: PaletteName
  hair: PaletteName
  jacket: PaletteName
  jacketDark: PaletteName
  scarf: PaletteName
  scarfDark: PaletteName
  trousers: PaletteName
  boots: PaletteName
}

export const HERO_COLORS: HeroColors = {
  skin: 'skin',
  hair: 'brown',
  jacket: 'slate',
  jacketDark: 'slateDark',
  scarf: 'brick',
  scarfDark: 'brickDark',
  trousers: 'woodLight',
  boots: 'brown',
}

export const SECOND_COLORS: HeroColors = {
  skin: 'skin',
  hair: 'slateDark',
  jacket: 'ochre',
  jacketDark: 'wood',
  scarf: 'green',
  scarfDark: 'greenDark',
  trousers: 'brown',
  boots: 'brickDark',
}

/** Что делает человечек. Ходьба накладывается на любое действие, если он движется. */
export type HeroAction = 'idle' | 'walk' | 'pull' | 'shake' | 'carry' | 'drink' | 'sit' | 'shiver' | 'cheer' | 'climb' | 'wave' | 'dangle'

type Eyes = 'open' | 'closed' | 'happy' | 'strain'
type V3 = [number, number, number]

/** Поза: смещение бёдер и повороты суставов (радианы). Всё в единицах кита. */
interface Pose {
  hip: V3
  hipR: V3
  torso: V3
  head: V3
  armL: V3
  armR: V3
  foreL: number
  foreR: number
  thighL: V3
  thighR: V3
  shinL: number
  shinR: number
  eyes: Eyes
  mouth: number
}

const rest = (): Pose => ({
  hip: [0, 0, 0],
  hipR: [0, 0, 0],
  torso: [0, 0, 0],
  head: [0, 0, 0],
  armL: [0, 0, -0.18],
  armR: [0, 0, 0.18],
  foreL: -0.25,
  foreR: -0.25,
  thighL: [0, 0, 0],
  thighR: [0, 0, 0],
  shinL: 0,
  shinR: 0,
  eyes: 'open',
  mouth: 0,
})

const clamp01 = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => {
  const x = clamp01(k)
  return x * x * (3 - 2 * x)
}
const span = (u: number, a: number, b: number) => ease((u - a) / (b - a))
const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const lerp3 = (a: V3, b: V3, k: number): V3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)]

function blend(a: Pose, b: Pose, k: number): Pose {
  return {
    hip: lerp3(a.hip, b.hip, k),
    hipR: lerp3(a.hipR, b.hipR, k),
    torso: lerp3(a.torso, b.torso, k),
    head: lerp3(a.head, b.head, k),
    armL: lerp3(a.armL, b.armL, k),
    armR: lerp3(a.armR, b.armR, k),
    foreL: lerp(a.foreL, b.foreL, k),
    foreR: lerp(a.foreR, b.foreR, k),
    thighL: lerp3(a.thighL, b.thighL, k),
    thighR: lerp3(a.thighR, b.thighR, k),
    shinL: lerp(a.shinL, b.shinL, k),
    shinR: lerp(a.shinR, b.shinR, k),
    eyes: k < 0.5 ? a.eyes : b.eyes,
    mouth: lerp(a.mouth, b.mouth, k),
  }
}

/** Дыхание и лёгкое покачивание — поверх любой позы, кроме прыжков. */
function breathe(p: Pose, t: number, k = 1) {
  const b = Math.sin(t * 2.2)
  p.hip[1] -= 0.18 * (b + 1) * k
  p.torso[0] += 0.02 * b * k
  p.armL[2] -= 0.03 * b * k
  p.armR[2] += 0.03 * b * k
}

/** Шаг: ноги, качание бёдер и рук. phase — фаза шага, w — сила 0..1, arms — махать ли руками. */
function walkOver(p: Pose, phase: number, w: number, arms: boolean) {
  if (w <= 0.001) return
  const s = Math.sin(phase)
  const c = Math.cos(phase)
  p.thighL[0] += -0.6 * s * w
  p.thighR[0] += 0.6 * s * w
  p.shinL += Math.max(0, -c) * 0.9 * w
  p.shinR += Math.max(0, c) * 0.9 * w
  p.hip[1] += (Math.abs(c) * 0.9 - 0.45) * w
  p.hipR[1] += -0.12 * s * w
  p.torso[0] += 0.1 * w
  p.torso[1] += 0.14 * s * w
  p.head[1] += -0.1 * s * w
  if (arms) {
    p.armL[0] += 0.55 * s * w
    p.armR[0] += -0.55 * s * w
    p.foreL += -0.2 * w
    p.foreR += -0.2 * w
  }
}

/** Позы действий. u — доля пройденного действия 0..1, t — секунды от начала. */
const ACTIONS: Record<HeroAction, (t: number, dur: number) => { pose: Pose; arms: boolean }> = {
  idle(t) {
    const p = rest()
    breathe(p, t)
    p.head[1] = 0.28 * Math.sin(t * 0.45)
    p.head[2] = 0.04 * Math.sin(t * 0.7)
    return { pose: p, arms: true }
  },
  walk(t) {
    const p = rest()
    breathe(p, t, 0.3)
    return { pose: p, arms: true }
  },
  pull(t, dur) {
    const u = t / Math.max(0.1, dur)
    const p = rest()
    // присесть и потянуться к слову
    const a = span(u, 0, 0.16)
    p.hip[1] = -2.4 * a
    p.torso[0] = 0.5 * a
    p.head[0] = 0.15 * a
    p.armL = [-1.25 * a, 0, -0.18 + 0.3 * a]
    p.armR = [-1.25 * a, 0, 0.18 - 0.3 * a]
    p.foreL = p.foreR = -0.25 + 0.15 * a
    p.thighL[0] = p.thighR[0] = -0.6 * a
    p.shinL = p.shinR = 0.9 * a
    // три рывка назад, ноги упёрты
    const b = span(u, 0.16, 0.26) * (1 - span(u, 0.84, 0.92))
    if (b > 0) {
      const v = clamp01((u - 0.2) / 0.64)
      const cyc = 0.5 - 0.5 * Math.cos(v * Math.PI * 2 * 3)
      const heave: Pose = {
        ...rest(),
        hip: [0, -1.8 - 0.7 * cyc, -1.8 - 1.8 * cyc],
        torso: [-0.32 - 0.38 * cyc, 0, 0],
        head: [-0.1 - 0.2 * cyc, 0, 0],
        armL: [-1.3 + 0.25 * cyc, 0, 0.14],
        armR: [-1.3 + 0.25 * cyc, 0, -0.14],
        foreL: -0.05,
        foreR: -0.05,
        thighL: [-1.0, 0, 0],
        thighR: [0.55, 0, 0],
        shinL: 0.45,
        shinR: 0.25,
        eyes: 'strain',
        mouth: 0,
      }
      Object.assign(p, blend(p, heave, b))
    }
    // слово вырвалось: шаг назад, слово в руках перед собой
    const c = span(u, 0.86, 1)
    if (c > 0) {
      const done: Pose = { ...rest(), armL: [-1.0, 0, 0.3], armR: [-1.0, 0, -0.3], foreL: -0.6, foreR: -0.6, eyes: 'happy', mouth: 1 }
      breathe(done, t)
      Object.assign(p, blend(p, done, c))
    }
    return { pose: p, arms: false }
  },
  shake(t) {
    // руки короткие, голова большая: трясём перед собой на уровне подбородка
    const p = rest()
    const w = Math.sin(t * 19)
    p.armL = [-1.75, 0, 0.42 + 0.12 * w]
    p.armR = [-1.75, 0, -0.42 + 0.12 * w]
    p.foreL = p.foreR = -0.55
    p.torso[2] = 0.1 * w
    p.hip[0] = 0.6 * w
    p.hip[1] = -0.4 * Math.abs(w)
    p.head[2] = -0.06 * w
    p.eyes = 'happy'
    p.mouth = 1
    return { pose: p, arms: false }
  },
  carry(t) {
    const p = rest()
    breathe(p, t, 0.5)
    p.armL = [-1.05, 0, 0.28]
    p.armR = [-1.05, 0, -0.28]
    p.foreL = p.foreR = -0.75
    p.eyes = 'happy'
    return { pose: p, arms: false }
  },
  drink(t, dur) {
    const u = t / Math.max(0.1, dur)
    const p = rest()
    breathe(p, t, 0.5)
    // кружка в правой руке поднимается ко рту, глоток с закрытыми глазами, потом «ах»
    const up = span(u, 0.05, 0.28) * (1 - span(u, 0.72, 0.88))
    p.armR = [lerp(-0.9, -1.55, up), 0, lerp(-0.25, -0.5, up)]
    p.foreR = lerp(-0.8, -1.55, up)
    p.head[0] = -0.22 * up
    p.torso[0] = -0.06 * up
    p.eyes = up > 0.6 ? 'closed' : u > 0.8 ? 'happy' : 'open'
    p.mouth = u > 0.8 && u < 0.95 ? 1 : 0
    p.hip[1] -= u > 0.8 ? 0.5 * span(u, 0.8, 0.9) : 0
    return { pose: p, arms: false }
  },
  sit(t) {
    const p = rest()
    const s = ease(t / 0.7)
    p.hip[1] = -7.2 * s
    p.thighL = [-1.5 * s, 0, -0.08 * s]
    p.thighR = [-1.5 * s, 0, 0.08 * s]
    p.torso[0] = -0.14 * s
    p.head[0] = 0.08 * s
    p.armL = [-0.65 * s, 0, -0.18 + 0.28 * s]
    p.armR = [-0.65 * s, 0, 0.18 - 0.28 * s]
    p.foreL = p.foreR = -0.25 - 0.45 * s
    if (s >= 1) breathe(p, t, 0.6)
    p.eyes = t > 1.0 ? 'happy' : 'open'
    return { pose: p, arms: false }
  },
  shiver(t) {
    const p = rest()
    const j = Math.sin(t * 55)
    p.hip = [0.35 * j, -0.7, 0]
    p.torso = [0.16, 0, 0.05 * Math.sin(t * 43)]
    p.head = [0.12, 0, 0.05 * Math.sin(t * 37)]
    p.armL = [-0.85, 0, 0.6]
    p.armR = [-0.85, 0, -0.6]
    p.foreL = p.foreR = -1.75
    p.thighL[2] = 0.07
    p.thighR[2] = -0.07
    p.eyes = 'strain'
    return { pose: p, arms: false }
  },
  climb(t, dur) {
    // выбирается из щели: руки цепляются за край над головой, ноги болтаются; потом колено на край
    const u = t / Math.max(0.1, dur)
    const p = rest()
    const kick = Math.sin(t * 11)
    const hang = 1 - span(u, 0.55, 0.8)
    p.armL = [lerp(-0.9, -2.5, hang), 0, lerp(-0.18, -0.45, hang)]
    p.armR = [lerp(-0.9, -2.5, hang), 0, lerp(0.18, 0.45, hang)]
    p.foreL = p.foreR = -0.45
    p.thighL = [lerp(-1.25, -0.35 + 0.3 * kick, hang), 0, 0]
    p.thighR = [lerp(0.1, -0.35 - 0.3 * kick, hang), 0, 0]
    p.shinL = lerp(1.3, 0.6, hang)
    p.shinR = lerp(0.2, 0.6, hang)
    p.torso[0] = 0.18 * hang + 0.3 * (1 - hang) * Math.sin(u * Math.PI)
    p.eyes = hang > 0.5 ? 'strain' : 'open'
    return { pose: p, arms: false }
  },
  wave(t) {
    const p = rest()
    breathe(p, t)
    const w = Math.sin(t * 9)
    p.armR = [-0.35, 0, 2.35 + 0.28 * w]
    p.foreR = -0.35
    p.head[2] = -0.06
    p.eyes = 'happy'
    p.mouth = 1
    return { pose: p, arms: false }
  },
  dangle(t) {
    // сидит на краю страницы: бёдра на бумаге, голени свисают за край и болтаются
    const p = rest()
    const s = ease(t / 0.5)
    p.hip[1] = -7.2 * s
    p.thighL = [-1.5 * s, 0, -0.06 * s]
    p.thighR = [-1.5 * s, 0, 0.06 * s]
    p.shinL = (1.45 + 0.35 * Math.sin(t * 4.2)) * s
    p.shinR = (1.45 + 0.35 * Math.sin(t * 4.2 + 2.2)) * s
    p.torso[0] = -0.08 * s
    p.armL = [0.35 * s, 0, -0.18 - 0.25 * s]
    p.armR = [0.35 * s, 0, 0.18 + 0.25 * s]
    p.foreL = p.foreR = -0.15
    p.head[2] = 0.08 * Math.sin(t * 1.3)
    if (s >= 1) breathe(p, t, 0.5)
    p.eyes = t > 0.8 ? 'happy' : 'open'
    return { pose: p, arms: false }
  },
  cheer(t) {
    const p = rest()
    const c = (t % 0.8) / 0.8
    p.eyes = 'happy'
    p.mouth = 1
    // руки буквой V в стороны — вверх их не видно за большой головой
    p.armL = [-0.35, 0, -2.35]
    p.armR = [-0.35, 0, 2.35]
    p.foreL = p.foreR = -0.35
    if (c < 0.22) {
      // присесть перед прыжком
      const d = Math.sin((c / 0.22) * Math.PI)
      p.hip[1] = -2.6 * d
      p.thighL[0] = p.thighR[0] = -0.65 * d
      p.shinL = p.shinR = 1.0 * d
      p.torso[0] = 0.25 * d
    } else if (c < 0.72) {
      const a = (c - 0.22) / 0.5
      const h = Math.sin(a * Math.PI)
      p.hip[1] = 8 * h
      p.thighL[0] = p.thighR[0] = -0.45 * h
      p.shinL = p.shinR = 0.95 * h
      p.torso[0] = -0.1 * h
    } else {
      const d = Math.sin(((c - 0.72) / 0.28) * Math.PI)
      p.hip[1] = -1.8 * d
      p.thighL[0] = p.thighR[0] = -0.45 * d
      p.shinL = p.shinR = 0.7 * d
    }
    return { pose: p, arms: false }
  },
}

const part = (s: Part['s'], p: Part['p'], d: Part['d'], c: PaletteName, extra: Partial<Part> = {}): Part => ({ s, p, d, c, ...extra })

/** Кусок тела как предмет кита: строим тем же сборщиком, что и предметы. */
function piece(id: string, parts: Part[], mat: MaterialFor) {
  const model: KitModel = { id, ru: id, stems: [], tags: [], hold: 'ground', parts }
  const g = buildKit(model, mat)
  // сборщик масштабирует в мир; внутри скелета работаем в единицах кита
  g.children[0].scale.setScalar(1)
  return g
}

const HIP_Y = 9.4
const SCARF_LINKS = 5
const SCARF_LEN = 2.2
const BLEND = 0.18

/**
 * Человечек: объёмная фигура из простых форм со скелетом и позами.
 * Все размеры — в единицах кита (рост около 34); корень стоит ногами на y = 0.
 */
export class Hero3D {
  readonly object = new THREE.Group()
  /** Внутренний корень в единицах кита. */
  readonly body = new THREE.Group()
  readonly hips = new THREE.Group()
  readonly torso = new THREE.Group()
  readonly head = new THREE.Group()
  readonly arm: { L: THREE.Group; R: THREE.Group }
  readonly fore: { L: THREE.Group; R: THREE.Group }
  readonly thigh: { L: THREE.Group; R: THREE.Group }
  readonly shin: { L: THREE.Group; R: THREE.Group }
  /** Точки в ладонях: к ним крепятся предметы. */
  readonly hand: { L: THREE.Object3D; R: THREE.Object3D }
  /** Точка между ладонями перед грудью (для предметов в обеих руках). */
  readonly chest = new THREE.Object3D()

  private eyeSets: Record<Eyes, THREE.Object3D[]> = { open: [], closed: [], happy: [], strain: [] }
  private mouth: THREE.Object3D
  private scarfLinks: THREE.Object3D[] = []
  private scarfAnchor = new THREE.Object3D()
  private chain: { p: THREE.Vector3; prev: THREE.Vector3 }[] = []
  private chainReady = false

  /** Правая рука поднята над головой 0..1 (держит зонт). */
  raiseR = 0

  /** Усталость 0..1: наклон вперёд, голова вниз, руки висят, глаза счастливые («устал, но доволен»). */
  tired = 0

  private action: HeroAction = 'idle'
  private t0 = 0
  private dur = 1
  private from: Pose = rest()
  private last: Pose = rest()

  constructor(readonly colors: HeroColors = HERO_COLORS, mat: MaterialFor = toonFor) {
    const c = colors
    this.object.add(this.body)
    this.body.scale.setScalar(KIT_UNIT)

    this.hips.position.set(0, HIP_Y, 0)
    this.body.add(this.hips)

    // ноги: бедро → голень → ботинок
    const leg = (side: 1 | -1) => {
      const thigh = new THREE.Group()
      thigh.position.set(side * 2.2, 0, 0)
      thigh.add(piece('thigh', [part('cap', [0, -2, 0], [3.4, 5, 3.4], c.trousers)], mat))
      const shin = new THREE.Group()
      shin.position.set(0, -4, 0)
      shin.add(
        piece(
          'shin',
          [
            part('cap', [0, -1.8, 0], [3.1, 4.4, 3.1], c.trousers),
            part('box', [0, -4.0, 0.7], [3.6, 2.4, 5], c.boots),
            part('box', [0, -5.0, 0.7], [3.8, 0.8, 5.2], 'brownDark'),
          ],
          mat,
        ),
      )
      thigh.add(shin)
      this.hips.add(thigh)
      return { thigh, shin }
    }
    const L = leg(-1)
    const R = leg(1)
    this.thigh = { L: L.thigh, R: R.thigh }
    this.shin = { L: L.shin, R: R.shin }

    // корпус: куртка с подолом, молнией и карманами
    this.hips.add(this.torso)
    this.torso.add(
      piece(
        'torso',
        [
          part('cyl', [0, 4.6, 0], [9.6, 8.6, 8], c.jacket),
          part('cyl', [0, 0.6, 0], [10.2, 1.6, 8.6], c.jacketDark),
          part('box', [0, 4.2, 4.0], [0.8, 7.4, 0.6], c.jacketDark),
          part('box', [-2.6, 2.2, 4.0], [2, 0.8, 0.5], c.jacketDark),
          part('box', [2.6, 2.2, 4.0], [2, 0.8, 0.5], c.jacketDark),
        ],
        mat,
      ),
    )

    // шарф: кольцо и узел; конец — цепочка на физике
    this.torso.add(
      piece(
        'scarf',
        [
          part('cyl', [0, 9.4, 0], [9.6, 2.8, 8.6], c.scarf),
          part('sph', [-1.8, 8.9, 4.2], [3.2, 2.6, 2], c.scarf),
        ],
        mat,
      ),
    )
    this.scarfAnchor.position.set(-1.9, 8.2, 4.5)
    this.torso.add(this.scarfAnchor)
    const scarfMat = mat(c.scarf, false)
    const linkGeo = new THREE.BoxGeometry(2.6, SCARF_LEN + 0.4, 0.9)
    for (let i = 0; i < SCARF_LINKS; i++) {
      const g = new THREE.Mesh(linkGeo, scarfMat)
      this.body.add(g)
      this.scarfLinks.push(g)
    }
    const fringe = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 0.9), mat(c.scarfDark, false))
    fringe.position.y = -SCARF_LEN / 2 - 0.3
    this.scarfLinks[SCARF_LINKS - 1].add(fringe)

    // руки: плечо → предплечье → кисть
    const armOf = (side: 1 | -1) => {
      const a = new THREE.Group()
      a.position.set(side * 5.3, 7.6, 0)
      a.add(piece('arm', [part('cap', [0, -2.1, 0], [3.0, 5.2, 3.0], c.jacket)], mat))
      const f = new THREE.Group()
      f.position.set(0, -4.2, 0)
      f.add(
        piece(
          'fore',
          [
            part('cap', [0, -1.6, 0], [2.8, 4.2, 2.8], c.jacket),
            part('cyl', [0, -3.2, 0], [3.1, 1.0, 3.1], c.jacketDark),
            part('sph', [0, -4.4, 0], [3.0, 3.0, 3.0], c.skin),
          ],
          mat,
        ),
      )
      const h = new THREE.Object3D()
      h.position.set(0, -4.6, 0.6)
      f.add(h)
      a.add(f)
      this.torso.add(a)
      return { a, f, h }
    }
    const AL = armOf(-1)
    const AR = armOf(1)
    this.arm = { L: AL.a, R: AR.a }
    this.fore = { L: AL.f, R: AR.f }
    this.hand = { L: AL.h, R: AR.h }
    this.chest.position.set(0, 4.5, 8)
    this.torso.add(this.chest)

    // голова: лицо открыто спереди, волосы шапочкой с чёлкой, пряди по бокам и вихор
    this.head.position.set(0, 9.6, 0)
    this.torso.add(this.head)
    this.head.add(
      piece(
        'head',
        [
          part('sph', [0, 6.8, 0], [15.6, 14, 13.6], c.skin),
          part('sph', [0, 10.2, -0.4], [16.6, 10.4, 15.0], c.hair),
          part('sph', [0, 6.8, -2.6], [16.0, 12.6, 11], c.hair),
          part('sph', [-6.7, 6.6, -0.6], [3.6, 8.4, 9.4], c.hair),
          part('sph', [6.7, 6.6, -0.6], [3.6, 8.4, 9.4], c.hair),
          part('sph', [-3.6, 9.1, 6.0], [4.4, 3.0, 2.6], c.hair),
          part('sph', [0, 8.8, 6.6], [4.6, 3.2, 2.6], c.hair),
          part('sph', [3.6, 9.1, 6.0], [4.4, 3.0, 2.6], c.hair),
          part('cone', [0.8, 15.6, 0.8], [2.8, 4.6, 2.8], c.hair, { r: [-18, 0, -28] }),
          part('sph', [-4.7, 4.2, 5.3], [2.4, 1.4, 1], 'coral'),
          part('sph', [4.7, 4.2, 5.3], [2.4, 1.4, 1], 'coral'),
        ],
        mat,
      ),
    )

    // глаза: четыре набора, показывается один
    const ink = mat('ink', false)
    const stroke = (w: number, h: number, x: number, y: number, rz: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.2), ink)
      m.position.set(x, y, 0)
      m.rotation.z = rz
      return m
    }
    for (const side of [-1, 1]) {
      const at = new THREE.Vector3(side * 2.9, 5.7, 6.3)
      const make = (kind: Eyes, parts: THREE.Mesh[]) => {
        const g = new THREE.Group()
        g.position.copy(at)
        g.add(...parts)
        this.head.add(g)
        this.eyeSets[kind].push(g)
      }
      make('open', [stroke(1.6, 2.7, 0, 0, 0)])
      make('closed', [stroke(2.4, 0.7, 0, -0.3, 0)])
      make('happy', [stroke(1.5, 0.7, -0.5, 0, 0.75), stroke(1.5, 0.7, 0.5, 0, -0.75)])
      // «> <»: остриё к носу
      make('strain', [stroke(1.6, 0.7, 0, 0.45, side * 0.55), stroke(1.6, 0.7, 0, -0.45, -side * 0.55)])
    }
    this.mouth = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 1.0), mat(c.scarfDark, false))
    this.mouth.position.set(0, 3.3, 6.0)
    this.head.add(this.mouth)

    toPixelLayer(this.object)
    this.applyPose(rest(), 0)
  }

  /** Начать действие с момента t0 (время фильма). Поза плавно перетекает из текущей. */
  play(action: HeroAction, t0: number, dur = 1) {
    if (action === this.action && t0 === this.t0) return
    this.from = this.last
    this.action = action
    this.t0 = t0
    this.dur = dur
  }

  /** Сбросить позу и хвост шарфа (новый фильм, перемотка). */
  reset() {
    this.tired = 0
    this.raiseR = 0
    this.action = 'idle'
    this.t0 = 0
    this.from = rest()
    this.last = rest()
    this.chainReady = false
  }

  resetScarf() {
    this.chainReady = false
  }

  /**
   * Кадр. time — время фильма; walk — сила шага 0..1 (по скорости движения);
   * phase — фаза шага (по пройденному пути, чтобы ноги не скользили).
   */
  update(time: number, dt: number, walk = 0, phase = 0) {
    const t = Math.max(0, time - this.t0)
    const { pose, arms } = ACTIONS[this.action](t, this.dur)
    walkOver(pose, phase, walk * (this.action === 'sit' || this.action === 'dangle' || this.action === 'climb' ? 0 : 1), arms)
    if (this.raiseR > 0) {
      const k = this.raiseR
      pose.armR = [lerp(pose.armR[0], -2.55, k), 0, lerp(pose.armR[2], 0.32, k)]
      pose.foreR = lerp(pose.foreR, -0.25, k)
    }
    if (this.tired > 0) {
      const k = this.tired
      pose.torso[0] += 0.28 * k
      pose.head[0] += 0.22 * k
      pose.hip[1] -= 0.8 * k
      pose.armL[0] *= 1 - 0.6 * k
      pose.armR[0] *= 1 - 0.6 * k
      pose.armL[2] = lerp(pose.armL[2], -0.05, k)
      pose.armR[2] = lerp(pose.armR[2], 0.05, k)
      if (k > 0.5) pose.eyes = 'happy'
    }
    const k = ease(t / BLEND)
    const p = k < 1 ? blend(this.from, pose, k) : pose
    this.last = p
    this.applyPose(p, time)
    this.updateScarf(dt)
  }

  private applyPose(p: Pose, time: number) {
    this.hips.position.set(p.hip[0], HIP_Y + p.hip[1], p.hip[2])
    this.hips.rotation.set(...p.hipR)
    this.torso.rotation.set(...p.torso)
    this.head.rotation.set(...p.head)
    this.arm.L.rotation.set(...p.armL)
    this.arm.R.rotation.set(...p.armR)
    this.fore.L.rotation.x = p.foreL
    this.fore.R.rotation.x = p.foreR
    this.thigh.L.rotation.set(...p.thighL)
    this.thigh.R.rotation.set(...p.thighR)
    this.shin.L.rotation.x = p.shinL
    this.shin.R.rotation.x = p.shinR
    // моргание раз в 2–4 секунды, только с открытыми глазами
    const cycle = 3.1
    const blink = p.eyes === 'open' && (time + 0.7) % cycle < 0.12
    const eyes: Eyes = blink ? 'closed' : p.eyes
    for (const kind of Object.keys(this.eyeSets) as Eyes[]) for (const e of this.eyeSets[kind]) e.visible = kind === eyes
    this.mouth.visible = p.mouth > 0.5
  }

  private updateScarf(dt: number) {
    this.object.updateMatrixWorld(true)
    const anchor = this.scarfAnchor.getWorldPosition(new THREE.Vector3())
    const len = SCARF_LEN * KIT_UNIT * this.object.scale.y
    if (!this.chainReady) {
      this.chain = []
      for (let i = 0; i <= SCARF_LINKS; i++) {
        const p = anchor.clone().add(new THREE.Vector3(0, -len * i, 0))
        this.chain.push({ p, prev: p.clone() })
      }
      this.chainReady = true
    }
    const h = Math.min(dt, 1 / 30)
    const g = new THREE.Vector3(0, -9.8 * 0.35, 0)
    this.chain[0].prev.copy(this.chain[0].p)
    this.chain[0].p.copy(anchor)
    for (let i = 1; i < this.chain.length; i++) {
      const n = this.chain[i]
      const v = n.p.clone().sub(n.prev).multiplyScalar(0.9)
      n.prev.copy(n.p)
      n.p.add(v).addScaledVector(g, h * h)
    }
    // конец шарфа не проходит сквозь грудь
    const fwd = new THREE.Vector3(0, 0, 1).transformDirection(this.torso.matrixWorld)
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < this.chain.length; i++) {
        const a = this.chain[i - 1].p
        const b = this.chain[i].p
        const d = b.clone().sub(a)
        const l = d.length() || 1e-6
        b.copy(a).addScaledVector(d, len / l)
        const front = b.clone().sub(anchor).dot(fwd)
        if (front < 0) b.addScaledVector(fwd, -front)
      }
    }
    const inv = new THREE.Matrix4().copy(this.body.matrixWorld).invert()
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < SCARF_LINKS; i++) {
      const a = this.chain[i].p.clone().applyMatrix4(inv)
      const b = this.chain[i + 1].p.clone().applyMatrix4(inv)
      const m = this.scarfLinks[i]
      m.position.copy(a).add(b).multiplyScalar(0.5)
      m.quaternion.setFromUnitVectors(up, a.sub(b).normalize())
    }
  }
}
