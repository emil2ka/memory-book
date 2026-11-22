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

/** Героиня фильма, если дневник ведёт девочка: тёмные длинные волосы, бирюзовая куртка, коралловый шарф. */
export const GIRL_COLORS: HeroColors = {
  skin: 'skin',
  hair: 'brownDark',
  jacket: 'teal',
  jacketDark: 'tealDark',
  scarf: 'coral',
  scarfDark: 'brick',
  trousers: 'navy',
  boots: 'brownDark',
}
export const GIRL_ACCESSORY = 'long_hair' as const

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
type BaseAction = 'idle' | 'walk' | 'pull' | 'shake' | 'carry' | 'drink' | 'sit' | 'shiver' | 'cheer' | 'climb' | 'wave' | 'dangle'
/** Эмоции и действия дня (план 15): человечек сам играет «скучно», «грустно», «танцевали» — без слова-предмета. */
export type EmotionAction =
  | 'bored' | 'sad' | 'joy' | 'excited' | 'tired' | 'sleepy' | 'angry' | 'scared' | 'surprised' | 'love'
  | 'laugh' | 'cry' | 'calm' | 'proud' | 'think' | 'nervous' | 'lonely'
export type DoAction =
  | 'run' | 'dance' | 'hug' | 'read' | 'write' | 'phone' | 'eat' | 'cook' | 'sleep' | 'guitar'
  | 'photo' | 'clap' | 'point' | 'look' | 'throw' | 'kick'
export type HeroAction = BaseAction | EmotionAction | DoAction

type Eyes = 'open' | 'closed' | 'happy' | 'strain' | 'sad' | 'wide' | 'angry' | 'sleepy' | 'heart'
/** Значок у головы: слеза, пот, «z», сердечко, «!», «?», метка злости, нота. */
export type Emote = 'none' | 'tear' | 'sweat' | 'z' | 'heart' | 'bang' | 'q' | 'anger' | 'note'
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
  emote: Emote
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
  emote: 'none',
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
    emote: k < 0.5 ? a.emote : b.emote,
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
type PoseFn = (t: number, dur: number) => { pose: Pose; arms: boolean }

const BASE_ACTIONS: Record<BaseAction, PoseFn> = {
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
        emote: 'none',
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

/** Руки висят вдоль тела, плечи опущены. */
const droop = (p: Pose, k = 1) => {
  p.armL = [0.05 * k, 0, -0.06]
  p.armR = [0.05 * k, 0, 0.06]
  p.foreL = p.foreR = -0.08
}
/** Сидит на бумаге, колени к груди. */
const huddle = (p: Pose, s: number) => {
  p.hip[1] = -7.4 * s
  p.thighL = [-2.1 * s, 0, -0.1 * s]
  p.thighR = [-2.1 * s, 0, 0.1 * s]
  p.shinL = p.shinR = 2.1 * s
  p.torso[0] = 0.32 * s
  p.armL = [-1.25 * s, 0, 0.35 * s]
  p.armR = [-1.25 * s, 0, -0.35 * s]
  p.foreL = p.foreR = -1.1 * s
}
const loopU = (t: number, period: number) => (t % period) / period

const EXTRA_ACTIONS: Record<EmotionAction | DoAction, PoseFn> = {
  // ---------- эмоции ----------
  bored(t) {
    // сник, качается с ноги на ногу; раз в 3 с — вздох плечами и зевок
    const p = rest()
    breathe(p, t, 0.6)
    droop(p)
    p.torso[0] = 0.26
    p.head = [0.32, 0, 0.18 + 0.06 * Math.sin(t * 0.8)]
    p.hip[0] = 0.5 * Math.sin(t * 0.9)
    p.eyes = 'sleepy'
    const c = loopU(t, 3.2)
    const yawn = Math.sin(clamp01((c - 0.55) / 0.35) * Math.PI)
    if (yawn > 0) {
      p.head[0] = lerp(p.head[0], -0.3, yawn)
      p.armR = [lerp(0.05, -2.2, yawn), 0, lerp(0.06, 0.4, yawn)]
      p.foreR = lerp(-0.08, -1.2, yawn)
      p.eyes = yawn > 0.3 ? 'closed' : 'sleepy'
      p.mouth = yawn > 0.3 ? 1 : 0
    }
    const sigh = Math.sin(clamp01(c / 0.25) * Math.PI)
    p.hip[1] += 0.6 * sigh
    return { pose: p, arms: false }
  },
  sad(t) {
    const p = rest()
    breathe(p, t, 0.4)
    droop(p)
    p.torso[0] = 0.16
    p.head = [0.24, 0, 0.12 + 0.05 * Math.sin(t * 0.6)]
    p.hip[1] = -0.6
    p.armL[2] = 0.05
    p.armR[2] = -0.05
    p.eyes = 'sad'
    p.emote = 'tear'
    return { pose: p, arms: false }
  },
  joy(t) {
    // лёгкие подскоки, руки чуть в стороны
    const p = rest()
    const h = Math.abs(Math.sin(t * 6))
    p.hip[1] = 2.2 * h
    p.thighL[0] = p.thighR[0] = -0.2 * h
    p.shinL = p.shinR = 0.4 * h
    p.armL = [-0.2, 0, -0.9 - 0.3 * h]
    p.armR = [-0.2, 0, 0.9 + 0.3 * h]
    p.foreL = p.foreR = -0.4
    p.head[2] = 0.08 * Math.sin(t * 6)
    p.eyes = 'happy'
    p.mouth = 1
    return { pose: p, arms: false }
  },
  excited(t, dur) {
    const r = BASE_ACTIONS.cheer(t * 1.25, dur)
    r.pose.emote = 'bang'
    return r
  },
  tired(t) {
    const p = rest()
    breathe(p, t * 0.6, 1.4)
    droop(p)
    p.torso[0] = 0.3
    p.head = [0.16, 0, 0.14]
    p.hip[1] = -1.4
    p.thighL[0] = p.thighR[0] = -0.25
    p.shinL = p.shinR = 0.45
    p.armL[0] = p.armR[0] = 0.25
    p.eyes = 'sleepy'
    p.emote = 'sweat'
    return { pose: p, arms: false }
  },
  sleepy(t) {
    // клюёт носом: голова падает и вздрагивает, иногда тянется
    const p = rest()
    breathe(p, t, 0.8)
    droop(p)
    const c = loopU(t, 2.6)
    const nod = c < 0.8 ? ease(c / 0.8) : 1 - ease((c - 0.8) / 0.2)
    p.head = [0.55 * nod, 0, 0.12 * nod]
    p.torso[0] = 0.18 + 0.12 * nod
    p.eyes = nod > 0.4 ? 'closed' : 'sleepy'
    p.emote = 'z'
    return { pose: p, arms: false }
  },
  angry(t) {
    // топает по очереди, кулаки вниз, корпус вперёд
    const p = rest()
    const c = loopU(t, 0.6)
    const left = Math.floor(t / 0.6) % 2 === 0
    const lift = Math.sin(c * Math.PI)
    if (left) {
      p.thighL[0] = -0.7 * lift
      p.shinL = 0.9 * lift
    } else {
      p.thighR[0] = -0.7 * lift
      p.shinR = 0.9 * lift
    }
    p.hip[1] = -0.8 + 0.6 * lift
    p.torso[0] = 0.22
    p.head = [0.12, 0, 0.04 * Math.sin(t * 30)]
    p.armL = [0.25, 0, -0.42]
    p.armR = [0.25, 0, 0.42]
    p.foreL = p.foreR = -1.25
    p.eyes = 'angry'
    p.mouth = c < 0.5 ? 1 : 0
    p.emote = 'anger'
    return { pose: p, arms: false }
  },
  scared(t) {
    // присел, руки закрывают лицо, дрожит
    const p = rest()
    const j = Math.sin(t * 48)
    p.hip = [0.3 * j, -2.6, -0.6]
    p.thighL[0] = p.thighR[0] = -0.55
    p.shinL = p.shinR = 0.95
    p.torso = [0.25, 0, 0.04 * j]
    p.head = [0.2, 0, 0.05 * Math.sin(t * 40)]
    p.armL = [-1.55, 0, 0.55]
    p.armR = [-1.55, 0, -0.55]
    p.foreL = p.foreR = -1.65
    p.eyes = 'wide'
    p.emote = 'sweat'
    return { pose: p, arms: false }
  },
  surprised(t) {
    // отпрыгивает назад, руки вверх в стороны, рот «о»
    const p = rest()
    const jump = Math.sin(clamp01(t / 0.35) * Math.PI)
    const back = ease(t / 0.35)
    p.hip = [0, 3.2 * jump, -2.2 * back]
    p.torso[0] = -0.22 * back
    p.head[0] = -0.16 * back
    p.armL = [-0.3, 0, -1.9 * back]
    p.armR = [-0.3, 0, 1.9 * back]
    p.foreL = p.foreR = -0.5
    if (t > 0.35) breathe(p, t, 0.5)
    p.eyes = 'wide'
    p.mouth = 1
    p.emote = 'bang'
    return { pose: p, arms: false }
  },
  love(t) {
    // ладони у груди, качается из стороны в сторону, сердечки
    const p = rest()
    breathe(p, t)
    const s = Math.sin(t * 2.4)
    p.hipR[2] = 0.08 * s
    p.torso[2] = 0.1 * s
    p.head = [-0.08, 0, 0.18 * s]
    p.armL = [-1.25, 0, 0.62]
    p.armR = [-1.25, 0, -0.62]
    p.foreL = p.foreR = -1.5
    p.eyes = 'heart'
    p.mouth = 1
    p.emote = 'heart'
    return { pose: p, arms: false }
  },
  laugh(t) {
    // хохочет: корпус качается вперёд-назад, руки на животе
    const p = rest()
    const b = Math.sin(t * 14)
    p.torso[0] = -0.18 + 0.16 * b
    p.head[0] = -0.3 + 0.12 * b
    p.hip[1] = -0.4 * Math.abs(b)
    p.armL = [-0.75, 0, 0.42]
    p.armR = [-0.75, 0, -0.42]
    p.foreL = p.foreR = -1.25
    p.eyes = 'happy'
    p.mouth = 1
    return { pose: p, arms: false }
  },
  cry(t) {
    // трёт глаза кулаками по очереди, плечи вздрагивают
    const p = rest()
    const sob = Math.abs(Math.sin(t * 7))
    p.torso[0] = 0.25
    p.head = [0.28, 0, 0.06 * Math.sin(t * 3)]
    p.hip[1] = -0.5 - 0.4 * sob
    const rub = Math.sin(t * 5)
    p.armL = [-1.7 - 0.15 * rub, 0, 0.5]
    p.armR = [-1.7 + 0.15 * rub, 0, -0.5]
    p.foreL = p.foreR = -2.0
    p.eyes = 'closed'
    p.mouth = sob > 0.5 ? 1 : 0
    p.emote = 'tear'
    return { pose: p, arms: false }
  },
  calm(t) {
    // большой потягушечный вдох, потом спокойное дыхание с закрытыми глазами
    const p = rest()
    const st = Math.sin(clamp01(t / 2.2) * Math.PI)
    p.armL = [-0.3 * st, 0, -0.18 - 2.2 * st]
    p.armR = [-0.3 * st, 0, 0.18 + 2.2 * st]
    p.foreL = p.foreR = -0.25 + 0.15 * st
    p.torso[0] = -0.12 * st
    p.head[0] = -0.2 * st
    p.hip[1] = 0.5 * st
    breathe(p, t * 0.7, 1.2)
    p.eyes = t > 0.4 ? 'happy' : 'open'
    return { pose: p, arms: false }
  },
  proud(t) {
    // руки в боки, грудь вперёд, подбородок вверх
    const p = rest()
    breathe(p, t)
    p.torso[0] = -0.16
    p.head = [-0.18, 0.15 * Math.sin(t * 0.7), 0]
    p.armL = [0.5, 0, -0.85]
    p.armR = [0.5, 0, 0.85]
    p.foreL = p.foreR = -1.7
    p.thighL[2] = -0.12
    p.thighR[2] = 0.12
    p.eyes = 'happy'
    return { pose: p, arms: false }
  },
  think(t) {
    // рука у подбородка, голова набок, «?»
    const p = rest()
    breathe(p, t)
    p.armR = [-1.25, 0, -0.42]
    p.foreR = -2.05 + 0.08 * Math.sin(t * 6)
    p.armL = [-0.75, 0, 0.55]
    p.foreL = -1.2
    p.head = [-0.12, 0.2 * Math.sin(t * 0.5), 0.2]
    p.torso[2] = 0.05
    p.emote = 'q'
    return { pose: p, arms: false }
  },
  nervous(t) {
    // переминается, теребит руки, оглядывается
    const p = rest()
    const s = Math.sin(t * 4)
    p.hip[0] = 0.6 * s
    p.hipR[2] = 0.06 * s
    p.thighL[0] = -0.15 * Math.max(0, s)
    p.thighR[0] = -0.15 * Math.max(0, -s)
    p.armL = [-0.95, 0, 0.5 + 0.08 * Math.sin(t * 11)]
    p.armR = [-0.95, 0, -0.5 + 0.08 * Math.sin(t * 13)]
    p.foreL = p.foreR = -0.9
    p.head = [0.08, 0.45 * Math.sin(t * 1.7), 0]
    p.eyes = 'wide'
    p.emote = 'sweat'
    return { pose: p, arms: false }
  },
  lonely(t) {
    const p = rest()
    huddle(p, ease(t / 0.8))
    p.head = [0.42, 0, 0.12]
    if (t > 0.8) p.torso[0] += 0.03 * Math.sin(t * 1.6)
    p.eyes = 'sad'
    return { pose: p, arms: false }
  },
  // ---------- действия ----------
  run(t) {
    const p = rest()
    p.torso[0] = 0.32
    p.head[0] = -0.12
    const s = Math.sin(t * 10)
    p.armL = [0.9 * s, 0, -0.2]
    p.armR = [-0.9 * s, 0, 0.2]
    p.foreL = p.foreR = -1.5
    p.eyes = 'strain'
    return { pose: p, arms: false }
  },
  dance(t) {
    // бёдра влево-вправо, руки по очереди вверх, шаг в сторону
    const p = rest()
    const s = Math.sin(t * 5)
    const c = Math.cos(t * 5)
    p.hip = [1.2 * s, -0.8 * Math.abs(c), 0]
    p.hipR[2] = 0.1 * s
    p.torso[2] = -0.14 * s
    p.head[2] = 0.12 * s
    p.armL = [-0.3, 0, -1.2 - 1.0 * Math.max(0, s)]
    p.armR = [-0.3, 0, 1.2 + 1.0 * Math.max(0, -s)]
    p.foreL = p.foreR = -0.6
    p.thighL[0] = -0.35 * Math.max(0, c)
    p.thighR[0] = -0.35 * Math.max(0, -c)
    p.shinL = 0.5 * Math.max(0, c)
    p.shinR = 0.5 * Math.max(0, -c)
    p.eyes = 'happy'
    p.mouth = 1
    p.emote = 'note'
    return { pose: p, arms: false }
  },
  hug(t) {
    // раскрыл руки — обнял
    const p = rest()
    breathe(p, t)
    const k = ease(clamp01((t - 0.3) / 0.5))
    p.armL = [-1.25, 0, lerp(-1.3, 0.7, k)]
    p.armR = [-1.25, 0, lerp(1.3, -0.7, k)]
    p.foreL = p.foreR = lerp(-0.3, -1.25, k)
    p.torso[0] = 0.12 * k
    p.head[2] = 0.14 * k
    p.eyes = k > 0.5 ? 'happy' : 'open'
    p.emote = k > 0.7 ? 'heart' : 'none'
    return { pose: p, arms: false }
  },
  read(t) {
    // книга перед собой, голова вниз, раз в 2.5 с перелистывает
    const p = rest()
    breathe(p, t, 0.5)
    p.armL = [-1.2, 0, 0.32]
    p.armR = [-1.2, 0, -0.32]
    p.foreL = p.foreR = -0.9
    p.head[0] = 0.32
    const flip = Math.sin(clamp01((loopU(t, 2.5) - 0.8) / 0.2) * Math.PI)
    p.armR[2] = -0.32 + 0.5 * flip
    return { pose: p, arms: false }
  },
  write(t) {
    // пишет: левая придерживает, правая водит ручкой
    const p = rest()
    breathe(p, t, 0.5)
    p.torso[0] = 0.25
    p.head[0] = 0.38
    p.armL = [-0.95, 0, 0.35]
    p.foreL = -0.9
    p.armR = [-1.0, 0, -0.15 + 0.12 * Math.sin(t * 9)]
    p.foreR = -0.95 + 0.1 * Math.sin(t * 13)
    return { pose: p, arms: false }
  },
  phone(t) {
    // смотрит в телефон, большой палец листает
    const p = rest()
    breathe(p, t, 0.5)
    p.armR = [-1.25, 0, -0.32]
    p.foreR = -1.55 + 0.06 * Math.sin(t * 8)
    p.armL = [-1.1, 0, 0.42]
    p.foreL = -1.45
    p.head[0] = 0.42
    return { pose: p, arms: false }
  },
  eat(t) {
    // ложка ко рту чаще, чем кружка, жуёт
    const p = rest()
    breathe(p, t, 0.5)
    const c = loopU(t, 1.1)
    const up = Math.sin(clamp01(c / 0.6) * Math.PI)
    p.armR = [lerp(-0.9, -1.6, up), 0, lerp(-0.2, -0.55, up)]
    p.foreR = lerp(-0.9, -1.7, up)
    p.armL = [-0.9, 0, 0.3]
    p.foreL = -0.9
    p.mouth = c > 0.6 ? (Math.sin(t * 16) > 0 ? 1 : 0) : up > 0.6 ? 1 : 0
    p.eyes = 'happy'
    return { pose: p, arms: false }
  },
  cook(t) {
    // мешает в кастрюле перед собой по кругу
    const p = rest()
    breathe(p, t, 0.5)
    p.torso[0] = 0.15
    p.head[0] = 0.3
    p.armR = [-0.95 + 0.15 * Math.sin(t * 5), 0, -0.2 + 0.15 * Math.cos(t * 5)]
    p.foreR = -0.9
    p.armL = [-0.8, 0, 0.45]
    p.foreL = -0.8
    return { pose: p, arms: false }
  },
  sleep(t) {
    // лёг на бок прямо на бумагу, дышит
    const p = rest()
    const s = ease(t / 0.8)
    p.hip = [0, -HIP_Y + 4.2 * s + (1 - s) * HIP_Y * 0, 0]
    p.hip[1] = lerp(0, -HIP_Y + 4.4, s)
    p.hipR = [0, 0, 1.45 * s]
    p.thighL = [-0.5 * s, 0, 0]
    p.thighR = [-0.6 * s, 0, 0]
    p.shinL = p.shinR = 0.7 * s
    p.armL = [-0.6 * s, 0, 0.2]
    p.armR = [-1.4 * s, 0, 0.6 * s]
    p.foreL = p.foreR = -0.9 * s
    p.head[2] = -0.25 * s
    if (s >= 1) p.torso[0] = 0.04 * Math.sin(t * 1.8)
    p.eyes = 'closed'
    p.emote = s > 0.8 ? 'z' : 'none'
    return { pose: p, arms: false }
  },
  guitar(t) {
    // левая на грифе в сторону, правая бьёт по струнам у живота
    const p = rest()
    breathe(p, t, 0.5)
    p.armL = [-0.85, 0, -0.85]
    p.foreL = -0.5
    p.armR = [-0.6, 0, -0.25]
    p.foreR = -1.35 + 0.25 * Math.sin(t * 16)
    p.head = [0.15, 0, 0.12 * Math.sin(t * 2.5)]
    p.hip[0] = 0.3 * Math.sin(t * 2.5)
    p.eyes = 'happy'
    p.emote = 'note'
    return { pose: p, arms: false }
  },
  photo(t) {
    // камера у лица двумя руками, щелчок
    const p = rest()
    breathe(p, t, 0.4)
    p.armL = [-1.55, 0, 0.42]
    p.armR = [-1.55, 0, -0.42]
    p.foreL = p.foreR = -1.45
    const click = loopU(t, 1.6)
    p.head[0] = 0.04 + (click > 0.7 && click < 0.78 ? 0.05 : 0)
    p.eyes = click > 0.7 && click < 0.78 ? 'closed' : 'open'
    p.emote = click > 0.72 && click < 0.95 ? 'bang' : 'none'
    return { pose: p, arms: false }
  },
  clap(t) {
    const p = rest()
    const s = Math.abs(Math.sin(t * 8))
    p.armL = [-1.15, 0, 0.12 + 0.4 * s]
    p.armR = [-1.15, 0, -0.12 - 0.4 * s]
    p.foreL = p.foreR = -0.95
    p.hip[1] = -0.3 * s
    p.eyes = 'happy'
    p.mouth = 1
    return { pose: p, arms: false }
  },
  point(t) {
    // показывает рукой вперёд-вбок, голова туда же
    const p = rest()
    breathe(p, t)
    p.armR = [-1.45, 0, 0.55]
    p.foreR = -0.05
    p.head = [-0.05, -0.35, 0]
    p.torso[1] = -0.15
    p.mouth = 1
    return { pose: p, arms: false }
  },
  look(t) {
    // ладонь козырьком, медленно оглядывается
    const p = rest()
    breathe(p, t)
    p.armR = [-1.9, 0, -0.35]
    p.foreR = -1.85
    p.head = [-0.1, 0.65 * Math.sin(t * 0.9), 0]
    p.torso[1] = 0.2 * Math.sin(t * 0.9)
    return { pose: p, arms: false }
  },
  throw(t) {
    // замах назад — бросок вперёд, по кругу
    const p = rest()
    const c = loopU(t, 1.4)
    const wind = span(c, 0, 0.45) * (1 - span(c, 0.45, 0.6))
    const fling = span(c, 0.45, 0.6) * (1 - span(c, 0.8, 1))
    p.armR = [lerp(lerp(0, 1.4, wind), -2.0, fling), 0, 0.3]
    p.foreR = -0.9 * wind - 0.1
    p.armL = [-0.8 * wind + 0.4 * fling, 0, -0.35]
    p.torso = [0.25 * fling - 0.1 * wind, 0.35 * wind - 0.3 * fling, 0]
    p.thighL[0] = -0.45 * fling
    p.eyes = fling > 0.3 ? 'strain' : 'open'
    return { pose: p, arms: false }
  },
  kick(t) {
    // удар правой ногой вперёд, руки для равновесия
    const p = rest()
    const c = loopU(t, 1.2)
    const back = span(c, 0, 0.35) * (1 - span(c, 0.35, 0.45))
    const hit = span(c, 0.35, 0.5) * (1 - span(c, 0.7, 0.95))
    p.thighR = [0.6 * back - 1.5 * hit, 0, 0]
    p.shinR = 1.2 * back + 0.1 * hit
    p.torso[0] = -0.15 * hit
    p.armL = [-0.6 * hit, 0, -0.9]
    p.armR = [0.4 * hit, 0, 0.7]
    p.foreL = p.foreR = -0.3
    p.eyes = hit > 0.4 ? 'strain' : 'open'
    return { pose: p, arms: false }
  },
}

const ACTIONS: Record<HeroAction, PoseFn> = { ...BASE_ACTIONS, ...EXTRA_ACTIONS }

/** Сердечко из двух шаров и ромба — для глаз «влюблён» и значка над головой. */
function heartMesh(size: number, m: THREE.Material): THREE.Group {
  const g = new THREE.Group()
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.5 * size, 10, 8), m)
    b.position.set(sx * 0.42 * size, 0.25 * size, 0)
    g.add(b)
  }
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.85 * size, 0.85 * size, 0.7 * size), m)
  tip.rotation.z = Math.PI / 4
  tip.position.set(0, -0.2 * size, 0)
  g.add(tip)
  return g
}

const part = (s: Part['s'], p: Part['p'], d: Part['d'], c: PaletteName, extra: Partial<Part> = {}): Part => ({ s, p, d, c, ...extra })

/** Вещи на голову второго человечка — закрытый список (assets/kit/companions.json, accessories). */
export type HeroAccessory = 'none' | 'cap' | 'bun' | 'headscarf' | 'kalpak' | 'glasses' | 'moustache' | 'long_hair'

/** Фигуры вещи в координатах головы: лицо — сфера в (0, 6.8, 0) размером 15.6×14×13.6, смотрит на +Z. */
function accessoryParts(a: HeroAccessory, c: HeroColors): Part[] {
  switch (a) {
    case 'headscarf':
      // платок: шапкой сверху и сзади, концы по щекам, узел под подбородком
      return [
        part('sph', [0, 11.0, -0.9], [18.2, 10.8, 16.8], c.scarf),
        part('sph', [-7.5, 6.2, -1.2], [3.6, 9.4, 9.6], c.scarf),
        part('sph', [7.5, 6.2, -1.2], [3.6, 9.4, 9.6], c.scarf),
        part('sph', [0, 6.4, -6.2], [14, 10, 4], c.scarfDark),
        part('sph', [0, 0.6, 4.6], [3.4, 2.4, 2.4], c.scarfDark),
      ]
    case 'cap':
      // кепка козырьком вперёд
      return [
        part('sph', [0, 12.2, -0.3], [16.8, 8.4, 15.8], c.jacketDark),
        part('box', [0, 10.4, 7.6], [11, 1.2, 6.2], c.jacketDark, { r: [-8, 0, 0] }),
      ]
    case 'kalpak':
      // ак калпак: высокий белый колпак с чёрными отворотами
      return [
        part('cone', [0, 18.6, -0.4], [14.6, 11.6, 14.0], 'cream'),
        part('cyl', [0, 12.9, -0.4], [17.4, 2.6, 16.4], 'ink', { k: 16 }),
      ]
    case 'glasses':
      return [
        part('torus', [-3.0, 5.8, 7.0], [3.8, 3.8, 0.9], 'ink', { k: 12 }),
        part('torus', [3.0, 5.8, 7.0], [3.8, 3.8, 0.9], 'ink', { k: 12 }),
        part('box', [0, 6.2, 7.1], [1.8, 0.6, 0.6], 'ink'),
      ]
    case 'moustache':
      return [part('sph', [-1.4, 3.9, 6.6], [3.0, 1.3, 1.4], c.hair), part('sph', [1.4, 3.9, 6.6], [3.0, 1.3, 1.4], c.hair)]
    case 'long_hair':
      // волосы до плеч: сзади и по бокам
      return [
        part('sph', [0, 4.2, -3.4], [16.4, 16.4, 8.6], c.hair),
        part('sph', [-7.0, 3.0, -0.8], [3.8, 13.4, 8.4], c.hair),
        part('sph', [7.0, 3.0, -0.8], [3.8, 13.4, 8.4], c.hair),
      ]
    case 'bun':
      // пучок на макушке
      return [part('sph', [0, 16.6, -2.6], [6.4, 6.0, 6.4], c.hair), part('torus', [0, 14.4, -2.2], [5.2, 5.2, 1.2], c.scarf, { k: 12, r: [90, 0, 0] })]
    default:
      return []
  }
}

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

  private eyeSets: Record<Eyes, THREE.Object3D[]> = { open: [], closed: [], happy: [], strain: [], sad: [], wide: [], angry: [], sleepy: [], heart: [] }
  /** Значки у головы (план 15): показывается один, по позе. */
  private emotes: Partial<Record<Emote, THREE.Object3D>> = {}
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

  constructor(
    readonly colors: HeroColors = HERO_COLORS,
    mat: MaterialFor = toonFor,
    /** Одна вещь на голове второго человечка (assets/kit/companions.json): бабушке — платок, дедушке — калпак. */
    readonly accessory: HeroAccessory = 'none',
  ) {
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

    // вещь на голове: крупно и одним силуэтом, чтобы роль читалась издалека
    const acc = accessoryParts(accessory, c)
    if (acc.length) this.head.add(piece('accessory', acc, mat))

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
      const make = (kind: Eyes, parts: THREE.Object3D[]) => {
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
      // брови домиком, глаза меньше — грусть
      make('sad', [stroke(1.4, 2.0, 0, -0.3, 0), stroke(2.2, 0.6, 0, 2.0, side * 0.45)])
      // большие глаза и брови вверх — удивление, страх
      make('wide', [stroke(2.1, 3.3, 0, 0, 0), stroke(2.0, 0.6, 0, 2.9, -side * 0.12)])
      // брови к носу — злость
      make('angry', [stroke(1.6, 2.2, 0, -0.3, 0), stroke(2.4, 0.7, 0, 1.8, -side * 0.55)])
      // полуприкрытые веки — сонный, скучно
      make('sleepy', [stroke(2.2, 1.1, 0, -0.5, 0), stroke(2.4, 0.5, 0, 0.3, 0)])
      // сердечки вместо глаз
      make('heart', [heartMesh(1.0, mat('coral', false))])
    }
    // значки у головы: слеза, пот, «z», сердечко, «!», «?», метка злости, нота
    const em = (key: Emote, parts: THREE.Object3D[], at: [number, number, number]) => {
      const g = new THREE.Group()
      g.position.set(...at)
      g.add(...parts)
      g.visible = false
      this.head.add(g)
      this.emotes[key] = g
    }
    const blob = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), m)
      o.scale.set(w, h, d)
      o.position.set(x, y, z)
      return o
    }
    const bar = (w: number, h: number, x: number, y: number, rz: number, m: THREE.Material) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.4), m)
      o.position.set(x, y, 0)
      o.rotation.z = rz
      return o
    }
    const water = mat('ice', false)
    const sun = mat('yellow', false)
    const red = mat('brick', false)
    em('tear', [blob(1.3, 2.0, 1.2, 0, 0, 0, water)], [2.9, 3.6, 6.9])
    em('sweat', [blob(1.8, 2.6, 1.4, 0, 0, 0, water)], [8.2, 11.5, 2.5])
    em('z', [bar(3.2, 0.8, 0, 1.4, 0, ink), bar(3.6, 0.8, 0, 0, 0.8, ink), bar(3.2, 0.8, 0, -1.4, 0, ink), bar(2.0, 0.6, 3.4, 3.6, 0, ink), bar(2.2, 0.6, 3.4, 2.8, 0.8, ink), bar(2.0, 0.6, 3.4, 2.0, 0, ink)], [8.5, 17, 1])
    em('heart', [heartMesh(2.2, mat('coral', false))], [8.5, 16.5, 1])
    em('bang', [bar(1.3, 4.0, 0, 1.2, 0, red), bar(1.3, 1.2, 0, -2.0, 0, red)], [8.6, 17, 1])
    em('q', [bar(3.0, 0.9, 0, 2.6, 0, sun), bar(0.9, 1.8, 1.2, 1.6, 0, sun), bar(1.8, 0.9, 0.5, 0.4, -0.5, sun), bar(0.9, 1.0, 0, -0.6, 0, sun), bar(0.9, 0.9, 0, -2.2, 0, sun)], [8.6, 17, 1])
    em('anger', [bar(2.6, 0.8, 0, 0.9, 0.4, red), bar(2.6, 0.8, 0, -0.9, -0.4, red), bar(0.8, 2.6, 0.9, 0, 0.4, red), bar(0.8, 2.6, -0.9, 0, -0.4, red)], [7.2, 13.5, 3])
    em('note', [blob(1.9, 1.5, 1.2, 0, 0, 0, ink), bar(0.6, 4.2, 0.8, 2.1, 0, ink), bar(1.8, 0.7, 1.6, 4.0, -0.5, ink)], [9, 15.5, 1])
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
    for (const [key, g] of Object.entries(this.emotes) as [Emote, THREE.Object3D][]) {
      const on = key === p.emote
      g.visible = on
      if (!on) continue
      const base = g.userData.base ?? (g.userData.base = g.position.clone())
      const u = (time * 0.8) % 1
      if (key === 'tear') {
        // капля сбегает по щеке и появляется снова
        g.position.set(base.x, base.y - 3.2 * u, base.z)
        g.scale.setScalar(u < 0.85 ? 1 : 1 - (u - 0.85) / 0.15)
      } else if (key === 'z' || key === 'heart' || key === 'note') {
        // всплывают вверх и тают
        g.position.set(base.x + 0.8 * Math.sin(time * 2), base.y + 3 * u, base.z)
        g.scale.setScalar(0.7 + 0.5 * Math.sin(u * Math.PI))
      } else {
        // подпрыгивают на месте
        g.position.set(base.x, base.y + 0.6 * Math.abs(Math.sin(time * 6)), base.z)
        g.scale.setScalar(1)
      }
    }
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
