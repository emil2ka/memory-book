// Картинки предметов (2D, решение Эмиля от 21 ноября): SVG, нарисованные Claude.
// validateSvg — белый список: только простые фигуры, цвета палитры, никаких скриптов, ссылок и текста.
// Одна проверка для библиотеки (assets/kit2d) и для дорисовки (/api/make). Без DOM — работает и на сервере.
import { PALETTE, css } from '../scene/palette'

/** Холст картинки: предмет по центру X, стоит на линии y = SVG_GROUND. */
export const SVG_VIEWBOX = '0 0 100 100'
export const SVG_GROUND = 96
export const SVG_LIMITS = { maxChars: 16000, maxElements: 120, maxDepth: 6 } as const

const HEX = new Map<string, string>(Object.entries(PALETTE).map(([name, v]) => [css(v), name]))
/** Цвет палитры → hex, для промпта и авторов. */
export const PALETTE_HEX: Record<string, string> = Object.fromEntries(Object.entries(PALETTE).map(([n, v]) => [n, css(v)]))

const ELEMENTS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'])
const COMMON = ['fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap', 'transform', 'opacity', 'fill-rule']
const ATTRS: Record<string, string[]> = {
  svg: ['xmlns', 'viewBox', 'width', 'height', ...COMMON],
  g: COMMON,
  path: ['d', ...COMMON],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry', ...COMMON],
  circle: ['cx', 'cy', 'r', ...COMMON],
  ellipse: ['cx', 'cy', 'rx', 'ry', ...COMMON],
  polygon: ['points', ...COMMON],
  polyline: ['points', ...COMMON],
  line: ['x1', 'y1', 'x2', 'y2', ...COMMON],
}
const NUMERIC = new Set(['x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'stroke-width', 'opacity'])

export interface SvgCheck {
  ok: boolean
  /** Нормализованная картинка: цвета в нижнем регистре, без комментариев и лишних пробелов. */
  svg?: string
  errors: string[]
  warnings: string[]
  /** Сколько элементов и какие цвета палитры использованы. */
  stats?: { elements: number; colors: string[] }
}

const nearestPaletteHex = (hex: string): string => {
  const v = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  let best = ''
  let bd = Infinity
  for (const h of HEX.keys()) {
    const w = parseInt(h.slice(1), 16)
    const d = (r - ((w >> 16) & 255)) ** 2 + (g - ((w >> 8) & 255)) ** 2 + (b - (w & 255)) ** 2
    if (d < bd) [bd, best] = [d, h]
  }
  return best
}

/**
 * Проверить и нормализовать SVG. fit — мягкий режим дорисовки: чужой цвет заменить ближайшим из палитры
 * (с предупреждением), а не отклонить.
 */
export function validateSvg(raw: unknown, opts: { fit?: boolean } = {}): SvgCheck {
  const errors: string[] = []
  const warnings: string[] = []
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, errors: ['svg: пустая строка'], warnings }
  let src = raw.trim().replace(/<\?xml[^>]*\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim()
  if (opts.fit) {
    // частые огрехи модели: потерянный «<» перед тегом и незакрытый корень
    const fixed = src.replace(/>\s*(path|rect|circle|ellipse|polygon|polyline|line|g)\s+(?=[a-z-]+=)/g, '><$1 ')
    if (fixed !== src) warnings.push('восстановлен потерянный «<»')
    src = fixed
    // недописанный последний тег перед </svg> — выбросить
    const cut = src.replace(/<(?:path|rect|circle|ellipse|polygon|polyline|line|g)\b[^<>]*(?=<\/svg>)/g, '')
    if (cut !== src) warnings.push('выброшен недописанный тег')
    src = cut
    if (!/<\/svg>\s*$/.test(src)) {
      src += '</svg>'
      warnings.push('добавлен </svg>')
    }
  }
  if (src.length > SVG_LIMITS.maxChars) errors.push(`svg: длиннее ${SVG_LIMITS.maxChars} знаков (${src.length})`)
  if (/<!DOCTYPE|<!ENTITY|<\s*script|javascript:|data:|url\s*\(|&#|@import/i.test(src)) errors.push('svg: запрещённое содержимое (скрипт, ссылка, data:, url(), сущности)')
  if (errors.length) return { ok: false, errors, warnings }

  const colors = new Set<string>()
  const out: string[] = []
  const stack: string[] = []
  let elements = 0
  const tagRe = /<\s*(\/?)\s*([a-zA-Z][\w:-]*)([^>]*?)(\/?)\s*>|([^<]+)/g
  let m: RegExpExecArray | null
  let rootSeen = false
  while ((m = tagRe.exec(src))) {
    if (m[5] !== undefined) {
      if (m[5].trim()) errors.push(`текст внутри svg запрещён: «${m[5].trim().slice(0, 20)}»`)
      continue
    }
    const closing = m[1] === '/'
    const tag = m[2]
    const selfClosing = m[4] === '/'
    if (!ELEMENTS.has(tag)) {
      errors.push(`элемент <${tag}> не разрешён (можно: ${[...ELEMENTS].join(', ')})`)
      continue
    }
    if (closing) {
      if (stack.pop() !== tag) errors.push(`незакрытый или лишний </${tag}>`)
      out.push(`</${tag}>`)
      continue
    }
    if (tag === 'svg') {
      if (rootSeen || stack.length) errors.push('вложенный <svg> запрещён')
      rootSeen = true
    } else if (!rootSeen) errors.push(`<${tag}> вне <svg>`)
    elements++
    if (stack.length >= SVG_LIMITS.maxDepth) errors.push('слишком глубокая вложенность')
    const attrs: string[] = []
    const attrRe = /([a-zA-Z][\w:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g
    let a: RegExpExecArray | null
    const rest = m[3].replace(attrRe, '').trim()
    if (rest) errors.push(`<${tag}>: непонятные атрибуты «${rest.slice(0, 30)}»`)
    attrRe.lastIndex = 0
    while ((a = attrRe.exec(m[3]))) {
      const name = a[1]
      let val = (a[3] ?? a[4] ?? '').trim()
      if (!ATTRS[tag].includes(name)) {
        if (name === 'id' || name === 'class' || name.startsWith('data-')) continue // безвредно, просто выбрасываем
        if (opts.fit && !/^on/i.test(name) && !/href/i.test(name)) {
          warnings.push(`<${tag}>: атрибут ${name} выброшен`)
          continue
        }
        errors.push(`<${tag}>: атрибут ${name} не разрешён`)
        continue
      }
      if (name === 'fill' || name === 'stroke') {
        const v = val.toLowerCase()
        if (v !== 'none') {
          const hex = /^#[0-9a-f]{3}$/.test(v) ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v
          if (!/^#[0-9a-f]{6}$/.test(hex)) {
            errors.push(`<${tag}> ${name}="${val}": только hex из палитры или none`)
            continue
          }
          if (!HEX.has(hex)) {
            if (opts.fit) {
              const near = nearestPaletteHex(hex)
              warnings.push(`${hex} → ${near} (${HEX.get(near)})`)
              val = near
            } else {
              errors.push(`<${tag}> ${name}="${val}": цвета нет в палитре`)
              continue
            }
          } else val = hex
          colors.add(HEX.get(val)!)
        } else val = 'none'
      }
      if (NUMERIC.has(name) && !/^-?\d*\.?\d+$/.test(val)) {
        errors.push(`<${tag}> ${name}="${val}": нужно число`)
        continue
      }
      if (name === 'transform' && !/^((translate|rotate|scale)\(\s*-?[\d.]+(\s*[ ,]\s*-?[\d.]+){0,2}\s*\)\s*)+$/.test(val)) {
        errors.push(`<${tag}> transform="${val}": только translate/rotate/scale`)
        continue
      }
      if ((name === 'd' && !/^[MmLlHhVvCcSsQqTtAaZz\d\s,.\-eE]+$/.test(val)) || ((name === 'points') && !/^[\d\s,.\-]+$/.test(val))) {
        errors.push(`<${tag}> ${name}: только числа и команды пути`)
        continue
      }
      if (tag === 'svg' && name === 'viewBox' && val.replace(/\s+/g, ' ') !== SVG_VIEWBOX) {
        errors.push(`viewBox должен быть "${SVG_VIEWBOX}"`)
        continue
      }
      attrs.push(`${name}="${val}"`)
    }
    if (tag === 'svg') {
      if (!attrs.some((x) => x.startsWith('xmlns='))) attrs.unshift('xmlns="http://www.w3.org/2000/svg"')
      if (!attrs.some((x) => x.startsWith('viewBox='))) errors.push(`нужен viewBox="${SVG_VIEWBOX}"`)
    }
    out.push(`<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${selfClosing ? '/' : ''}>`)
    if (!selfClosing) stack.push(tag)
  }
  if (!rootSeen) errors.push('нет корневого <svg>')
  if (stack.length) errors.push(`не закрыты: ${stack.join(', ')}`)
  if (elements > SVG_LIMITS.maxElements) errors.push(`элементов ${elements}, можно до ${SVG_LIMITS.maxElements}`)
  if (elements < 6) errors.push(`элементов ${elements}: слишком просто, нужно от 6`)
  if (errors.length) return { ok: false, errors, warnings }
  return { ok: true, svg: out.join(''), errors, warnings, stats: { elements, colors: [...colors] } }
}

/** data URL для <img> и текстуры. */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

// ---------- предмет-картинка ----------

import type { Fx, FxKind, Hold } from './format'

/** Предмет в 2D: те же поля поиска, что у KitModel, плюс картинка SVG. id совпадают с библиотекой кита. */
export interface KitPicture {
  id: string
  ru: string
  kk?: string
  en?: string
  stems: string[]
  tags: string[]
  hold: Hold
  fx?: Fx[]
  /** SVG 100×100, предмет по центру, стоит на линии y ≈ SVG_GROUND. */
  svg: string
  by?: 'library' | 'claude'
}

export interface PictureCheck {
  ok: boolean
  picture?: KitPicture
  errors: string[]
  warnings: string[]
}

const PIC_ID = /^[a-z][a-z0-9_]{1,40}$/
const HOLD_LIST: Hold[] = ['hand', 'both', 'ground']
const FX_LIST: FxKind[] = ['steam', 'smoke', 'flame', 'glow', 'sparkle', 'drip', 'bob', 'spin', 'sway', 'notes', 'hearts']

/** Проверка предмета-картинки: поля поиска + validateSvg. fit — мягкий режим дорисовки. */
export function validatePicture(raw: unknown, opts: { fit?: boolean } = {}): PictureCheck {
  const errors: string[] = []
  const warnings: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, errors: ['ожидается объект'], warnings }
  const o = raw as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id.trim().toLowerCase().replace(/[\s-]+/g, '_') : ''
  if (!PIC_ID.test(id)) errors.push(`id: латиница snake_case (получено ${JSON.stringify(o.id)})`)
  const ru = typeof o.ru === 'string' ? o.ru.trim() : ''
  if (!ru) errors.push('ru: нужно название')
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().toLowerCase()).filter(Boolean) : [])
  let stems = [...new Set(list(o.stems))]
  if (stems.some((s) => s.replace(/\$$/, '').length < 3)) {
    if (opts.fit) {
      stems = stems.filter((s) => s.replace(/\$$/, '').length >= 3)
      warnings.push('stems: короткие выброшены')
    } else errors.push('stems: основы от 3 букв')
  }
  if (!stems.length && ru) stems = [ru.toLowerCase()]
  const hold = o.hold as Hold
  if (!HOLD_LIST.includes(hold)) errors.push(`hold: одно из ${HOLD_LIST.join(', ')}`)
  const fx = (Array.isArray(o.fx) ? o.fx : []).filter((f): f is Fx => !!f && typeof f === 'object' && FX_LIST.includes((f as Fx).kind)).slice(0, 3)
  const svgCheck = validateSvg(o.svg, opts)
  errors.push(...svgCheck.errors)
  warnings.push(...svgCheck.warnings)
  if (errors.length) return { ok: false, errors, warnings }
  const str = (k: 'kk' | 'en') => (typeof o[k] === 'string' && (o[k] as string).trim() ? { [k]: (o[k] as string).trim() } : {})
  const picture: KitPicture = { id, ru, ...str('kk'), ...str('en'), stems, tags: [...new Set(list(o.tags))].slice(0, 8), hold, ...(fx.length ? { fx } : {}), svg: svgCheck.svg! }
  if (o.by === 'library' || o.by === 'claude') picture.by = o.by
  return { ok: true, picture, errors, warnings }
}
