// Штрихи буквы для ручки: глиф рукописного шрифта утончается до линии в один пиксель (Zhang–Suen),
// линия разбирается на штрихи, и штрихи выстраиваются, как пишет рука: слева направо, сверху вниз,
// кружки — против часовой, точки и галочки над буквой — в конце.
// Работает для любой буквы шрифта, включая казахские (ә ғ қ ң ө ұ ү һ і). Результат — в долях кегля:
// x от точки, где fillText начинает букву, y от базовой линии (вниз — плюс, как в canvas).

export type Pt = [number, number]

export interface Glyph {
  /** Штрихи по порядку письма; точки — в долях кегля. */
  strokes: Pt[][]
  /** Средняя толщина линии буквы в долях кегля (радиус «чернил» под ручкой). */
  width: number
}

// ---------- утончение ----------

/** Соседи по кругу: N, NE, E, SE, S, SW, W, NW. */
const RING: Pt[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
]

/** Zhang–Suen: утончает бинарную картинку (1 — чернила) до линии в один пиксель. Края картинки должны быть пустыми. */
export function thin(img: Uint8Array, w: number, h: number): void {
  const del: number[] = []
  let changed = true
  while (changed) {
    changed = false
    for (let step = 0; step < 2; step++) {
      del.length = 0
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x
          if (!img[i]) continue
          const p = RING.map(([dx, dy]) => img[i + dy * w + dx])
          const b = p.reduce((s, v) => s + v, 0)
          if (b < 2 || b > 6) continue
          let a = 0
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++
          if (a !== 1) continue
          const [n, , e, , s, , wst] = p
          if (step === 0 ? n * e * s === 0 && e * s * wst === 0 : n * e * wst === 0 && n * s * wst === 0) del.push(i)
        }
      }
      if (del.length) changed = true
      for (const i of del) img[i] = 0
    }
  }
  // «ступеньки»: угловой пиксель, соседи которого и так касаются друг друга, — лишний
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (!img[i]) continue
      const p = RING.map(([dx, dy]) => img[i + dy * w + dx])
      const n = p.reduce((s, v) => s + v, 0)
      // 2–3 соседа, которые касаются друг друга: без этого пикселя линия не рвётся
      if (n >= 2 && n <= 3 && ringParts(p) === 1) img[i] = 0
    }
  }
}

/** Сколько отдельных групп соседей вокруг пикселя (с учётом того, что N и E касаются по диагонали). */
function ringParts(p: number[]): number {
  const seen = new Array(8).fill(false)
  let parts = 0
  for (let k = 0; k < 8; k++) {
    if (!p[k] || seen[k]) continue
    parts++
    const stack = [k]
    seen[k] = true
    while (stack.length) {
      const c = stack.pop()!
      const near = [(c + 1) % 8, (c + 7) % 8]
      if (c % 2 === 0) near.push((c + 2) % 8, (c + 6) % 8)
      for (const m of near) {
        if (p[m] && !seen[m]) {
          seen[m] = true
          stack.push(m)
        }
      }
    }
  }
  return parts
}

// ---------- обход скелета ----------

/**
 * Разбирает скелет на штрихи (в пикселях). Начало — концы линий сверху вниз; на развилке идём прямо;
 * перекрёсток можно пересечь, даже если центр уже пройден. Замкнутые кольца — от верхней точки против часовой.
 */
export function traceSkeleton(img: Uint8Array, w: number, h: number, minLen = 3): Pt[][] {
  const visited = new Uint8Array(w * h)
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? img[y * w + x] : 0)
  const degree = (x: number, y: number) => RING.reduce((s, [dx, dy]) => s + at(x + dx, y + dy), 0)
  const strokes: Pt[][] = []
  // короткий кусок оставляем, только если это отдельная точка (у «ё», «і»), а не хвостик линии
  const keep = (p: Pt[]) => {
    if (p.length >= minLen) return true
    const own = new Set(p.map(([x, y]) => y * w + x))
    const alone = p.every(([x, y]) => RING.every(([dx, dy]) => !at(x + dx, y + dy) || own.has((y + dy) * w + x + dx)))
    if (alone && p.length === 1) p.push([p[0][0] + 1, p[0][1]])
    return alone
  }

  const walk = (sx: number, sy: number, dir: Pt | null): Pt[] => {
    const path: Pt[] = [[sx, sy]]
    visited[sy * w + sx] = 1
    let [x, y] = [sx, sy]
    let d = dir
    for (;;) {
      let best: Pt | null = null
      let bestScore = Infinity
      for (const [dx, dy] of RING) {
        const nx = x + dx
        const ny = y + dy
        if (!at(nx, ny) || visited[ny * w + nx]) continue
        const len = Math.hypot(dx, dy)
        let score = len * 0.01
        if (d) score += 1 - (dx * d[0] + dy * d[1]) / (len * Math.hypot(d[0], d[1]))
        if (score < bestScore) {
          bestScore = score
          best = [dx, dy]
        }
      }
      if (!best && d) {
        // перекрёсток: шагнуть через уже пройденный пиксель, если за ним линия продолжается
        const sx2 = Math.sign(d[0])
        const sy2 = Math.sign(d[1])
        const mx = x + sx2
        const my = y + sy2
        const fx = x + sx2 * 2
        const fy = y + sy2 * 2
        if (at(mx, my) && at(fx, fy) && !visited[fy * w + fx]) {
          path.push([mx, my])
          best = [sx2 * 2, sy2 * 2]
        }
      }
      if (!best) break
      x += best[0]
      y += best[1]
      visited[y * w + x] = 1
      path.push([x, y])
      // направление — по последним шагам, чтобы на ступеньках не дёргалось
      const back = path[Math.max(0, path.length - 4)]
      d = [x - back[0], y - back[1]]
    }
    return path
  }

  // 1) открытые линии — от концов, сверху вниз, слева направо
  const ends: Pt[] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (img[y * w + x] && degree(x, y) === 1) ends.push([x, y])
  ends.sort((a, b) => a[1] + a[0] * 0.35 - (b[1] + b[0] * 0.35))
  for (const [x, y] of ends) {
    if (visited[y * w + x]) continue
    const p = walk(x, y, null)
    if (keep(p)) strokes.push(p)
  }
  // 2) остатки: кольца и куски за развилками
  for (;;) {
    let top: Pt | null = null
    for (let y = 0; y < h && !top; y++) for (let x = 0; x < w; x++) if (img[y * w + x] && !visited[y * w + x]) { top = [x, y]; break }
    if (!top) break
    // кольцо пишется против часовой: от верхней точки сначала влево
    const p = walk(top[0], top[1], [-1, 0.4])
    if (keep(p)) strokes.push(p)
  }
  return strokes
}

/** Упрощение ломаной (Рамер — Дуглас — Пекер). */
export function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts.slice()
  const [ax, ay] = pts[0]
  const [bx, by] = pts[pts.length - 1]
  const len = Math.hypot(bx - ax, by - ay) || 1
  let far = 0
  let idx = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i]
    const dist = Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / len
    if (dist > far) {
      far = dist
      idx = i
    }
  }
  if (far <= eps) return [pts[0], pts[pts.length - 1]]
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)]
}

export const strokeLength = (s: Pt[]) => s.reduce((sum, p, i) => (i ? sum + Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) : 0), 0)

/**
 * Порядок письма. Открытый штрих начинается с верхне-левого конца; штрихи — слева направо;
 * мелкие штрихи целиком выше строчных букв (точка у «і», кратка у «й», хвостик у «ә» не трогаем) — в конце.
 * topY — верх строчных букв в тех же единицах (отрицательный, над базовой линией).
 */
export function orderStrokes(strokes: Pt[][], topY: number, em = 1): Pt[][] {
  const info = strokes.map((s) => {
    const closed = s.length > 4 && Math.hypot(s[0][0] - s[s.length - 1][0], s[0][1] - s[s.length - 1][1]) < 0.08 * em
    let pts = s
    if (!closed) {
      const score = (p: Pt) => p[0] + p[1] * 1.2
      if (score(s[s.length - 1]) < score(s[0])) pts = s.slice().reverse()
    }
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const mark = Math.max(...ys) < topY - 0.04 * em && strokeLength(pts) < 0.45 * em
    return { pts, minX: Math.min(...xs), minY: Math.min(...ys), mark }
  })
  info.sort((a, b) => Number(a.mark) - Number(b.mark) || a.minX + a.minY * 0.25 - (b.minX + b.minY * 0.25))
  return info.map((i) => i.pts)
}

// ---------- глиф из шрифта (браузер) ----------

const F = 96
const cache = new Map<string, Glyph | null>()
if (typeof document !== 'undefined' && document.fonts) document.fonts.addEventListener('loadingdone', () => cache.clear())

/** Штрихи буквы шрифта family (как у Book.fontFamily). null — пробел или пустой глиф. */
export function glyphStrokes(ch: string, family: string): Glyph | null {
  const key = `${family}|${ch}`
  if (cache.has(key)) return cache.get(key)!
  const g = computeGlyph(ch, family)
  cache.set(key, g)
  return g
}

function computeGlyph(ch: string, family: string): Glyph | null {
  if (!ch.trim() || typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  const font = `${F}px ${family}`
  ctx.font = font
  const m = ctx.measureText(ch)
  const x0 = Math.ceil(F * 0.35)
  const base = Math.ceil(F * 1.3)
  c.width = Math.ceil(Math.max(m.width, m.actualBoundingBoxRight ?? m.width) + x0 * 2)
  c.height = Math.ceil(F * 1.8)
  ctx.font = font
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#000'
  ctx.fillText(ch, x0, base)
  const { data, width: w, height: h } = ctx.getImageData(0, 0, c.width, c.height)
  const img = new Uint8Array(w * h)
  let ink = 0
  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] > 110) {
      img[i] = 1
      ink++
    }
  }
  if (!ink) return null
  thin(img, w, h)
  let skel = 0
  for (let i = 0; i < w * h; i++) skel += img[i]
  const raw = traceSkeleton(img, w, h, Math.round(F * 0.04))
  if (!raw.length) return null
  // верх строчных — по букве «x» того же шрифта
  ctx.font = font
  const xh = ctx.measureText('x').actualBoundingBoxAscent || F * 0.45
  const toEm = (s: Pt[]): Pt[] => simplify(s, 0.7).map(([x, y]) => [(x - x0) / F, (y - base) / F])
  const strokes = orderStrokes(raw.map(toEm), -xh / F)
  return { strokes, width: skel ? ink / skel / F : 0.08 }
}
