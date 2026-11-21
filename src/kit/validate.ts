// Проверка и нормализация кита. Одна и та же для библиотеки и для дорисовки Claude:
// любой предмет, который попадёт в сцену, сначала проходит validateKit.
// Без three.js — работает и на сервере (api/make.ts), и в браузере, и в тестах.
import { PALETTE } from '../scene/palette'
import { KIT_LIMITS, type Fx, type FxKind, type Hold, type KitModel, type PaletteName, type Part, type Shape, type Vec3 } from './format'

export interface KitCheck {
  ok: boolean
  /** Нормализованный предмет; есть, только если ok. */
  model?: KitModel
  /** Почему не прошло. Пишется так, чтобы Claude мог исправить по этому списку. */
  errors: string[]
  /** Что поправлено молча: округление, обрезка, цвет-синоним. */
  warnings: string[]
}

export const SHAPES: readonly Shape[] = ['box', 'cyl', 'sph', 'cone', 'cap', 'torus', 'wedge', 'prism']
export const FX_KINDS: readonly FxKind[] = ['steam', 'smoke', 'flame', 'glow', 'sparkle', 'drip', 'bob', 'spin', 'sway', 'notes', 'hearts']
export const HOLDS: readonly Hold[] = ['hand', 'both', 'ground']
export const COLOR_NAMES = Object.keys(PALETTE) as PaletteName[]

/** Частые «чужие» имена цветов → ближайшее из палитры. Claude иногда пишет red вместо brick. */
const COLOR_ALIASES: Record<string, PaletteName> = {
  black: 'ink',
  dark: 'ink',
  red: 'brick',
  brick_red: 'brick',
  darkred: 'brickDark',
  orange: 'coral',
  pink: 'peach',
  gold: 'amber',
  golden: 'amber',
  beige: 'paper',
  tan: 'paperShade',
  sand: 'paperShade',
  blue: 'slate',
  darkblue: 'navy',
  lightblue: 'ice',
  sky: 'ice',
  slate_blue: 'slate',
  grey_blue: 'greyBlue',
  gray: 'grey',
  lightgray: 'greyLight',
  lightgrey: 'greyLight',
  silver: 'greyLight',
  purple: 'mauve',
  violet: 'mauve',
  darkpurple: 'plum',
  lime: 'mint',
  soft_green: 'greenSoft',
  darkgreen: 'greenDark',
  turquoise: 'teal',
  cyan: 'teal',
  snow: 'white',
  milk: 'white',
  yellowlight: 'yellow',
}

const lower = (s: string) => s.replace(/[\s_-]/g, '').toLowerCase()
const BY_LOWER = new Map<string, PaletteName>(COLOR_NAMES.map((c) => [lower(c), c]))

/** Имя цвета → имя из палитры или null. Регистр и подчёркивания не важны. */
export function paletteName(raw: unknown): { name: PaletteName; alias: boolean } | null {
  if (typeof raw !== 'string') return null
  if ((COLOR_NAMES as string[]).includes(raw)) return { name: raw as PaletteName, alias: false }
  const l = lower(raw)
  const exact = BY_LOWER.get(l)
  if (exact) return { name: exact, alias: true }
  const alias = COLOR_ALIASES[raw.toLowerCase()] ?? COLOR_ALIASES[l]
  return alias ? { name: alias, alias: true } : null
}

const half = (x: number) => Math.round(x * 2) / 2
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

function vec(raw: unknown): Vec3 | null {
  if (!Array.isArray(raw) || raw.length !== 3 || !raw.every(finite)) return null
  return [half(raw[0]), half(raw[1]), half(raw[2])]
}

/** Угол в (−180, 180]. */
const wrapDeg = (a: number) => {
  let x = ((a % 360) + 360) % 360
  if (x > 180) x -= 360
  return half(x) === -180 ? 180 : half(x)
}

const DEG = Math.PI / 180

/**
 * Габариты фигуры после поворота (оценка сверху): |R|·полуразмеры.
 * Для всех фигур кита полуразмеры по осям — d/2 (см. build.ts).
 */
export function partExtent(part: Pick<Part, 'p' | 'd' | 'r'>): { min: Vec3; max: Vec3 } {
  const [hx, hy, hz] = [part.d[0] / 2, part.d[1] / 2, part.d[2] / 2]
  const [ax, ay, az] = (part.r ?? [0, 0, 0]).map((a) => a * DEG)
  // матрица поворота в порядке XYZ (как Euler 'XYZ' в three.js): R = Rx · Ry · Rz
  const cx = Math.cos(ax), sx = Math.sin(ax)
  const cy = Math.cos(ay), sy = Math.sin(ay)
  const cz = Math.cos(az), sz = Math.sin(az)
  const m = [
    [cy * cz, -cy * sz, sy],
    [cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy],
    [sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy],
  ]
  const e = m.map((row) => Math.abs(row[0]) * hx + Math.abs(row[1]) * hy + Math.abs(row[2]) * hz)
  return {
    min: [part.p[0] - e[0], part.p[1] - e[1], part.p[2] - e[2]],
    max: [part.p[0] + e[0], part.p[1] + e[1], part.p[2] + e[2]],
  }
}

/** Габариты всего предмета в единицах кита. */
export function modelBounds(parts: Pick<Part, 'p' | 'd' | 'r'>[]): { min: Vec3; max: Vec3; size: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const p of parts) {
    const e = partExtent(p)
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], e.min[i])
      max[i] = Math.max(max[i], e.max[i])
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] }
}

/**
 * Висящие в воздухе куски (группы касающихся фигур, которые не стоят на земле) опустить,
 * пока они не лягут на то, что под ними. Нужно для дорисовки: Claude иногда оставляет
 * зазор между шаром глобуса и подставкой. Возвращает, сколько кусков опущено.
 */
export function settleParts(parts: Part[], tol = 0.75): number {
  const ext = parts.map((p) => partExtent(p))
  const touch = (a: number, b: number) =>
    [0, 1, 2].every((k) => ext[a].min[k] <= ext[b].max[k] + tol && ext[b].min[k] <= ext[a].max[k] + tol)
  // связные группы
  const group = parts.map((_, i) => i)
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])))
  for (let a = 0; a < parts.length; a++) for (let b = a + 1; b < parts.length; b++) if (touch(a, b)) group[find(a)] = find(b)
  const members = new Map<number, number[]>()
  parts.forEach((_, i) => members.set(find(i), [...(members.get(find(i)) ?? []), i]))
  const minY = Math.min(...ext.map((e) => e.min[1]))
  let moved = 0
  // снизу вверх: опущенный кусок сам становится опорой для следующих
  const comps = [...members.values()].sort((x, y) => Math.min(...x.map((i) => ext[i].min[1])) - Math.min(...y.map((i) => ext[i].min[1])))
  const grounded = new Set<number>()
  for (const comp of comps) {
    const low = Math.min(...comp.map((i) => ext[i].min[1]))
    if (low - minY <= tol) {
      comp.forEach((i) => grounded.add(i))
      continue
    }
    // ближайшая опора под куском: верх опорных фигур, которые пересекаются с ним по XZ
    let support = -Infinity
    for (const i of comp)
      for (const j of grounded) {
        const overlapXZ = [0, 2].every((k) => ext[i].min[k] < ext[j].max[k] && ext[j].min[k] < ext[i].max[k])
        if (overlapXZ && ext[j].max[1] <= ext[i].min[1] + tol) support = Math.max(support, ext[j].max[1] - (ext[i].min[1] - low))
      }
    if (support === -Infinity) continue
    const dy = half(low - support)
    if (dy <= 0) continue
    for (const i of comp) {
      parts[i].p[1] = half(parts[i].p[1] - dy)
      ext[i] = partExtent(parts[i])
      grounded.add(i)
    }
    moved++
  }
  return moved
}

const ID_RE = /^[a-z][a-z0-9_]{1,40}$/

export interface ValidateOptions {
  /** Сколько можно выйти за рекомендуемую высоту hold, в долях (по умолчанию 0.15). */
  heightSlack?: number
  /** Поставить предмет на землю (min y = 0), если он висит или провалился. По умолчанию да. */
  ground?: boolean
  /**
   * Мягкий режим для дорисовки: высоту вне диапазона hold исправить равномерным масштабом,
   * фигуры нулевого размера выбросить. Для библиотеки выключен — там такие ошибки чинятся руками.
   */
  fit?: boolean
}

/**
 * Проверить и нормализовать предмет. Округляет числа до 0.5, зажимает k в 3–24,
 * переводит углы в (−180, 180], ставит основание на y = 0, отбрасывает лишние поля.
 */
export function validateKit(raw: unknown, opts: ValidateOptions = {}): KitCheck {
  const errors: string[] = []
  const warnings: string[] = []
  const slack = opts.heightSlack ?? 0.15
  const fail = (): KitCheck => ({ ok: false, errors, warnings })

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push('model: ожидается объект KitModel')
    return fail()
  }
  const o = raw as Record<string, unknown>

  // --- имя и поиск ---
  const id = typeof o.id === 'string' ? o.id.trim().toLowerCase().replace(/[\s-]+/g, '_') : ''
  if (!ID_RE.test(id)) errors.push(`id: латиница snake_case, 2–41 знак, с буквы (получено ${JSON.stringify(o.id)})`)
  const ru = typeof o.ru === 'string' ? o.ru.trim() : ''
  if (!ru) errors.push('ru: нужно название по-русски')
  const optStr = (k: 'kk' | 'en') => (typeof o[k] === 'string' && (o[k] as string).trim() ? (o[k] as string).trim() : undefined)
  const kk = optStr('kk')
  const en = optStr('en')

  const strList = (k: 'stems' | 'tags'): string[] => {
    const v = o[k]
    if (v === undefined) return []
    if (!Array.isArray(v)) {
      errors.push(`${k}: ожидается массив строк`)
      return []
    }
    const out = v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter(Boolean)
    if (out.length !== v.length) warnings.push(`${k}: выброшены пустые и не строки`)
    return [...new Set(out)]
  }
  let stems = strList('stems')
  const tags = strList('tags')
  if (!stems.length && ru) {
    stems = [ru.toLowerCase()]
    warnings.push('stems: пусто — взято название ru')
  }
  const shortStem = stems.find((s) => s.length < 3)
  if (shortStem && opts.fit) {
    stems = stems.filter((s) => s.length >= 3)
    if (!stems.length && ru) stems = [ru.toLowerCase()]
    warnings.push('stems: короткие основы выброшены')
  } else if (shortStem) errors.push(`stems: основа «${shortStem}» короче 3 букв — будет ловить чужие слова`)

  const hold = o.hold as Hold
  if (!HOLDS.includes(hold)) errors.push(`hold: одно из ${HOLDS.join(', ')} (получено ${JSON.stringify(o.hold)})`)

  // --- фигуры ---
  const parts: Part[] = []
  if (!Array.isArray(o.parts) || o.parts.length === 0) {
    errors.push('parts: нужен непустой массив фигур')
  } else {
    if (o.parts.length > KIT_LIMITS.maxParts) errors.push(`parts: не больше ${KIT_LIMITS.maxParts} фигур (получено ${o.parts.length})`)
    o.parts.slice(0, KIT_LIMITS.maxParts).forEach((rp, i) => {
      const at = `parts[${i}]`
      if (!rp || typeof rp !== 'object') {
        errors.push(`${at}: ожидается объект`)
        return
      }
      const q = rp as Record<string, unknown>
      const s = q.s as Shape
      if (!SHAPES.includes(s)) {
        errors.push(`${at}.s: одно из ${SHAPES.join(', ')} (получено ${JSON.stringify(q.s)})`)
        return
      }
      const p = vec(q.p)
      const d = vec(q.d)
      if (!p) errors.push(`${at}.p: три числа [x, y, z]`)
      if (!d) errors.push(`${at}.d: три числа — габариты`)
      if (!p || !d) return
      if (p.some((x) => Math.abs(x) > KIT_LIMITS.maxCoord)) errors.push(`${at}.p: центр дальше ${KIT_LIMITS.maxCoord} от начала (${p.join(', ')})`)
      if (d.some((x) => x > KIT_LIMITS.maxSize)) errors.push(`${at}.d: габарит больше ${KIT_LIMITS.maxSize} (${d.join(', ')})`)
      if (d.some((x) => x < KIT_LIMITS.minSize)) {
        if (d.some((x) => x <= 0)) {
          if (opts.fit) {
            warnings.push(`${at}: нулевой габарит — фигура выброшена`)
            return
          }
          errors.push(`${at}.d: габарит должен быть больше 0 (${d.join(', ')})`)
        }
        else {
          for (let j = 0; j < 3; j++) d[j] = Math.max(KIT_LIMITS.minSize, d[j])
          warnings.push(`${at}.d: поднято до ${KIT_LIMITS.minSize}`)
        }
      }
      const color = paletteName(q.c)
      if (!color) {
        errors.push(`${at}.c: цвет из палитры: ${COLOR_NAMES.join(', ')} (получено ${JSON.stringify(q.c)})`)
        return
      }
      if (color.alias) warnings.push(`${at}.c: «${String(q.c)}» → ${color.name}`)
      const part: Part = { s, p, d, c: color.name }
      if (q.r !== undefined) {
        const r = vec(q.r)
        if (!r) errors.push(`${at}.r: три угла в градусах`)
        else if (r.some((x) => x !== 0)) part.r = [wrapDeg(r[0]), wrapDeg(r[1]), wrapDeg(r[2])]
      }
      if (q.k !== undefined) {
        if (!finite(q.k)) errors.push(`${at}.k: число граней 3–24`)
        else {
          const k = Math.max(3, Math.min(24, Math.round(q.k)))
          if (k !== q.k) warnings.push(`${at}.k: ${q.k} → ${k}`)
          part.k = k
        }
      }
      if (q.glow === true) part.glow = true
      if (typeof q.n === 'string' && q.n.trim()) part.n = q.n.trim()
      parts.push(part)
    })
  }

  // --- живые подсказки ---
  let fx: Fx[] | undefined
  if (o.fx !== undefined) {
    if (!Array.isArray(o.fx)) errors.push('fx: ожидается массив')
    else {
      fx = []
      for (const [i, rf] of o.fx.entries()) {
        const f = rf as Record<string, unknown> | null
        if (!f || !FX_KINDS.includes(f.kind as FxKind)) {
          warnings.push(`fx[${i}]: неизвестный kind ${JSON.stringify(f?.kind)} — выброшен`)
          continue
        }
        const item: Fx = { kind: f.kind as FxKind }
        if (f.at !== undefined) {
          const at = vec(f.at)
          if (at) item.at = at
          else warnings.push(`fx[${i}].at: не три числа — выброшено`)
        }
        if (typeof f.part === 'string' && f.part) {
          if (!parts.some((p) => p.n === f.part)) warnings.push(`fx[${i}].part: нет фигуры с n = «${f.part}»`)
          item.part = f.part
        }
        fx.push(item)
      }
      if (fx.length > 4) {
        warnings.push('fx: оставлено 4 подсказки')
        fx = fx.slice(0, 4)
      }
    }
  }

  if (errors.length || !parts.length) return fail()

  // --- основание на земле и высота ---
  let b = modelBounds(parts)
  const minY = half(b.min[1])
  if (minY !== 0 && opts.ground !== false) {
    for (const p of parts) p.p[1] = half(p.p[1] - minY)
    if (fx) for (const f of fx) if (f.at) f.at[1] = half(f.at[1] - minY)
    if (Math.abs(minY) > 1) warnings.push(`основание сдвинуто на y = 0 (было ${minY})`)
    b = modelBounds(parts)
  }
  if (opts.fit) {
    const moved = settleParts(parts)
    if (moved) {
      warnings.push(`опущено висящих кусков: ${moved}`)
      b = modelBounds(parts)
    }
  }
  let height = b.max[1] - b.min[1]
  const [lo, hi] = KIT_LIMITS.height[hold]
  if (opts.fit && height > 0 && (height < lo * (1 - slack) || height > hi * (1 + slack))) {
    // равномерный масштаб к ближайшей границе: пропорции предмета сохраняются
    const k = (height < lo ? lo : hi) / height
    for (const p of parts) {
      p.p = p.p.map((x) => half(x * k)) as Vec3
      p.d = p.d.map((x) => Math.max(KIT_LIMITS.minSize, half(x * k))) as Vec3
    }
    if (fx) for (const f of fx) if (f.at) f.at = f.at.map((x) => half(x * k)) as Vec3
    warnings.push(`высота ${height.toFixed(1)} → масштаб ×${k.toFixed(2)} под hold «${hold}»`)
    b = modelBounds(parts)
    if (b.min[1] !== 0) {
      const dy = half(b.min[1])
      for (const p of parts) p.p[1] = half(p.p[1] - dy)
      b = modelBounds(parts)
    }
    height = b.max[1] - b.min[1]
  }
  if (height < lo * (1 - slack) || height > hi * (1 + slack)) {
    errors.push(`высота ${height.toFixed(1)}: для hold «${hold}» нужно ${lo}–${hi}`)
  }
  const wide = Math.max(b.size[0], b.size[2])
  if (wide > KIT_LIMITS.maxSize) errors.push(`ширина ${wide.toFixed(1)} больше ${KIT_LIMITS.maxSize}`)
  if (errors.length) return fail()

  const model: KitModel = { id, ru, ...(kk ? { kk } : {}), ...(en ? { en } : {}), stems, tags, hold, ...(fx && fx.length ? { fx } : {}), parts }
  if (o.by === 'library' || o.by === 'claude') model.by = o.by
  return { ok: true, model, errors, warnings }
}

/** Высота и габариты предмета — для подписи в витрине и для тестов. */
export function kitSize(model: Pick<KitModel, 'parts'>): Vec3 {
  return modelBounds(model.parts).size
}
