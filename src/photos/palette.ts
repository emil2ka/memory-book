// Основные цвета фото. Чистые функции над RGBA-пикселями — работают и в node (тесты).
import { PALETTE } from '../scene/palette'

export interface Swatch {
  /** #rrggbb */
  hex: string
  /** Доля пикселей 0..1 */
  weight: number
  /** Ближайший цвет каталога (catalog.paletteColors) */
  name: string
}

/** Цвета каталога (catalog.paletteColors) в оттенках мастер-палитры сцены. */
export const CATALOG_COLORS: Record<string, number> = {
  cream: PALETTE.cream,
  amber: PALETTE.amber,
  ochre: PALETTE.ochre,
  brick_red: PALETTE.brick,
  coral: PALETTE.coral,
  soft_green: PALETTE.greenSoft,
  teal: PALETTE.teal,
  slate_blue: PALETTE.slate,
  navy: PALETTE.navy,
  grey_blue: PALETTE.greyBlue,
  white: PALETTE.white,
  brown: PALETTE.brown,
}

const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255]
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

/** «Красное» расстояние (redmean) — дёшево и ближе к глазу, чем евклидово. */
function dist2(a: [number, number, number], b: [number, number, number]): number {
  const rm = (a[0] + b[0]) / 2
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2]
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db
}

export function nearestCatalogColor(r: number, g: number, b: number): string {
  let best = 'cream'
  let bd = Infinity
  for (const [name, c] of Object.entries(CATALOG_COLORS)) {
    const d = dist2([r, g, b], rgb(c))
    if (d < bd) { bd = d; best = name }
  }
  return best
}

/**
 * k основных цветов: k-средних с детерминированной инициализацией (самые далёкие точки).
 * data — RGBA (ImageData.data); прозрачные пиксели пропускаются.
 */
export function extractPalette(data: Uint8ClampedArray | Uint8Array, k = 5): Swatch[] {
  const pts: [number, number, number][] = []
  const step = Math.max(1, Math.floor(data.length / 4 / 4096))
  for (let i = 0; i < data.length; i += 4 * step) if (data[i + 3] > 128) pts.push([data[i], data[i + 1], data[i + 2]])
  if (pts.length === 0) return []
  // инициализация: средний цвет, затем каждый раз самая далёкая точка
  const centers: [number, number, number][] = []
  const mean = pts.reduce((m, p) => [m[0] + p[0], m[1] + p[1], m[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length) as [number, number, number]
  centers.push(mean)
  while (centers.length < k) {
    let far = pts[0]
    let fd = -1
    for (const p of pts) {
      const d = Math.min(...centers.map((c) => dist2(p, c)))
      if (d > fd) { fd = d; far = p }
    }
    if (fd <= 0) break
    centers.push([...far])
  }
  const assign = new Int32Array(pts.length)
  for (let iter = 0; iter < 10; iter++) {
    for (let i = 0; i < pts.length; i++) {
      let bi = 0, bd = Infinity
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(pts[i], centers[c])
        if (d < bd) { bd = d; bi = c }
      }
      assign[i] = bi
    }
    const sums = centers.map(() => [0, 0, 0, 0])
    for (let i = 0; i < pts.length; i++) {
      const s = sums[assign[i]]
      s[0] += pts[i][0]; s[1] += pts[i][1]; s[2] += pts[i][2]; s[3]++
    }
    sums.forEach((s, c) => { if (s[3]) centers[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]] })
  }
  const counts = centers.map(() => 0)
  for (let i = 0; i < pts.length; i++) counts[assign[i]]++
  return centers
    .map((c, i) => ({ hex: hex(c[0], c[1], c[2]), weight: counts[i] / pts.length, name: nearestCatalogColor(c[0], c[1], c[2]) }))
    .filter((s) => s.weight > 0)
    .sort((a, b) => b.weight - a.weight)
}

/** Палитра дня по всем фото: имена каталога, взвешенные по доле, до max штук. */
export function dayPalette(photoSwatches: Swatch[][], max = 5): string[] {
  const score = new Map<string, number>()
  for (const sw of photoSwatches) for (const s of sw) score.set(s.name, (score.get(s.name) ?? 0) + s.weight)
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([n]) => n)
}
