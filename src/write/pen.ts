// Очередь письма: каждая напечатанная буква выводится ручкой по своим штрихам.
// Новые буквы в конце текста встают в очередь; вставка, правка в середине и длинный кусок появляются сразу.
// Отдаёт сцене: где кончик ручки (в долях кегля от начала буквы), прижат ли он, и сколько чернил уже на бумаге.
import type { Glyph, Pt } from './strokes'

export interface InkState {
  /** Буквы с индексом меньше — написаны целиком; с индексом больше — ещё не появились. */
  upTo: number
  /** Буква upTo пишется сейчас: чернила только в кружках радиуса r вокруг пройденных точек (доли кегля). */
  partial: { index: number; pts: Pt[]; r: number } | null
}

export interface PenPoint {
  index: number
  x: number
  y: number
  /** true — кончик на бумаге, false — ручка приподнята и переезжает. */
  down: boolean
}

interface TrackPoint {
  x: number
  y: number
  down: boolean
  /** накопленная «стоимость» пути: переезды по воздуху дешевле */
  s: number
}

interface Job {
  index: number
  track: TrackPoint[]
  total: number
  r: number
  t: number
  dur: number
}

/** Не больше стольких букв за раз пишется ручкой; длиннее — вставка, появляется сразу. */
const MAX_TYPED = 4
/** Шаг, с которым штрих режется на точки (доли кегля). */
const STEP = 0.025
/** Переезд по воздуху стоит меньше, чем штрих. */
const LIFT_COST = 0.35
/** Время до первого касания: ручка подносится к началу буквы. */
const LEAD = 0.05

/** Секунды на букву: длиннее штрихи — дольше, но в пределах, чтобы успевать за печатью. */
export function letterDuration(cost: number): number {
  return Math.min(0.26, Math.max(0.1, 0.06 + cost * 0.085))
}

/** Путь кончика по букве: штрихи по порядку, между ними — переезд по воздуху. */
export function buildTrack(g: Glyph): { track: TrackPoint[]; total: number } {
  const track: TrackPoint[] = []
  let s = LEAD
  let last: Pt | null = null
  for (const stroke of g.strokes) {
    const dense = resample(stroke, STEP)
    if (!dense.length) continue
    if (last) {
      s += Math.hypot(dense[0][0] - last[0], dense[0][1] - last[1]) * LIFT_COST
      track.push({ x: dense[0][0], y: dense[0][1], down: false, s })
    } else track.push({ x: dense[0][0], y: dense[0][1], down: false, s })
    // касание и сам штрих
    track.push({ x: dense[0][0], y: dense[0][1], down: true, s })
    for (let i = 1; i < dense.length; i++) {
      s += Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1])
      track.push({ x: dense[i][0], y: dense[i][1], down: true, s })
    }
    last = dense[dense.length - 1]
    // отрыв
    track.push({ x: last[0], y: last[1], down: false, s })
  }
  return { track, total: s }
}

function resample(pts: Pt[], step: number): Pt[] {
  if (pts.length < 2) return pts.slice()
  const out: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    const len = Math.hypot(bx - ax, by - ay)
    const n = Math.max(1, Math.ceil(len / step))
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n])
  }
  return out
}

export class PenWriter {
  private text = ''
  private queue: number[] = []
  private job: Job | null = null
  /** где кончик был в конце последней буквы — держим его там до следующей */
  private rest: PenPoint | null = null

  constructor(private glyphOf: (ch: string) => Glyph | null) {}

  /** Пишет ли ручка сейчас (есть буква в работе или в очереди). */
  get active(): boolean {
    return !!this.job || this.queue.length > 0
  }

  /** Сбросить без анимации: весь текст сразу на бумаге. */
  reset(text = '') {
    this.text = text
    this.queue = []
    this.job = null
    this.rest = null
  }

  /** Новый текст поля ввода. Дописанное в конце уходит в очередь, остальное — сразу. */
  setText(next: string) {
    const old = this.text
    if (next === old) return
    this.text = next
    if (next.startsWith(old) && next.length - old.length <= MAX_TYPED) {
      for (let i = old.length; i < next.length; i++) {
        const ch = next[i]
        if (/\s/.test(ch) || !this.glyphOf(ch)?.strokes.length) continue
        this.queue.push(i)
      }
      return
    }
    if (old.startsWith(next)) {
      // стёрли с конца: недописанное просто исчезает
      this.queue = this.queue.filter((i) => i < next.length)
      if (this.job && this.job.index >= next.length) this.job = null
      return
    }
    // вставка или правка в середине — всё сразу
    this.queue = []
    this.job = null
    this.rest = null
  }

  /** Шаг времени. true — чернила изменились (страницу надо перерисовать). */
  update(dt: number): boolean {
    let left = Math.max(0, dt)
    let changed = false
    while (left > 0 || (!this.job && this.queue.length)) {
      if (!this.job) {
        const index = this.queue.shift()
        if (index === undefined) break
        const g = this.glyphOf(this.text[index])
        if (!g) {
          changed = true
          continue
        }
        const { track, total } = buildTrack(g)
        this.job = { index, track, total, r: Math.max(0.05, g.width * 0.75), t: 0, dur: letterDuration(total) }
        changed = true
      }
      const job = this.job
      // отстаём от печати — пишем быстрее
      const speed = 1 + Math.max(0, this.queue.length - 1) * 0.6
      const need = (job.dur - job.t) / speed
      if (left < need) {
        job.t += left * speed
        left = 0
        changed = true
        break
      }
      left -= need
      const end = job.track[job.track.length - 1]
      this.rest = end ? { index: job.index, x: end.x, y: end.y, down: false } : null
      this.job = null
      changed = true
      if (!this.queue.length) break
    }
    return changed
  }

  /** Что видно на бумаге. null — всё написано. */
  ink(): InkState | null {
    if (!this.job && !this.queue.length) return null
    const upTo = this.job ? this.job.index : this.queue[0]
    if (!this.job) return { upTo, partial: null }
    const s = this.progress(this.job)
    const pts: Pt[] = []
    for (const p of this.job.track) {
      if (p.s > s) break
      if (p.down) pts.push([p.x, p.y])
    }
    const cur = this.point(this.job, s)
    if (cur.down) pts.push([cur.x, cur.y])
    return { upTo, partial: { index: this.job.index, pts, r: this.job.r } }
  }

  /** Где кончик ручки. null — ручке нечего писать (сцена ведёт её к курсору). */
  pen(): PenPoint | null {
    if (this.job) {
      const p = this.point(this.job, this.progress(this.job))
      return { index: this.job.index, ...p }
    }
    return this.queue.length ? null : this.rest
  }

  private progress(job: Job): number {
    return (Math.min(job.t, job.dur) / job.dur) * job.total
  }

  private point(job: Job, s: number): { x: number; y: number; down: boolean } {
    const tr = job.track
    if (!tr.length) return { x: 0, y: 0, down: false }
    if (s <= tr[0].s) return { x: tr[0].x, y: tr[0].y, down: false }
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1]
      const b = tr[i]
      if (s > b.s) continue
      const k = b.s > a.s ? (s - a.s) / (b.s - a.s) : 1
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, down: a.down && b.down }
    }
    const e = tr[tr.length - 1]
    return { x: e.x, y: e.y, down: false }
  }
}

