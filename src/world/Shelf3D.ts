// Полка-архив: прожитые дни стоят корешками. Одна модель book_spine, цвет и название даёт код.
import * as THREE from 'three'
import { CATALOG_COLORS } from '../photos/palette'
import { PALETTE } from '../scene/palette'
import { loadWorldModel, ownMaterial, type WorldModel } from './loader'
import { WORLD, spineColorName } from './manifest'
import type { DayScript } from '../types/script'

/** Что нужно полке о дне. */
export interface ShelfDay {
  id: string
  title: string
  /** Имя цвета каталога (amber, soft_green…), число 0xrrggbb или пусто — тогда из palette_hint / id. */
  color?: string | number
  paletteHint?: string[]
}

export const SHELF_SLOTS = 12
/** Первый корешок яруса — у правой стенки полки (внутренний край 4.25). */
const BOOKS_RIGHT_X = 3.95
const BOOK_PITCH = 0.55
/** Книг на верхнем ярусе: вся серия дней (5–7) видна одним рядом. */
const BOOKS_PER_ROW = 7

/**
 * Пространство корешка (стоит, высота по Y, корешок к +Z) → пространство закрытой книги на столе
 * (лежит, начало у корешка, корешок вдоль Z, страницы к +X, обложка вверх).
 */
export const BOOK_TO_SPINE = new THREE.Matrix4().set(
  0, 0, -1, 1.6,
  -1, 0, 0, 0.225,
  0, 1, 0, -2.1,
  0, 0, 0, 1,
)
const LABEL_W = 512
const LABEL_H = 64
/** Шрифт подписи — тот же рукописный, что на страницах. */
const FONT = 'Caveat, "Comic Sans MS", cursive'

interface SpineBook {
  day: ShelfDay
  model: WorldModel
  cover: THREE.MeshStandardMaterial | null
  label: THREE.MeshStandardMaterial | null
  labelTex: THREE.CanvasTexture | null
  slot: THREE.Object3D
  /** 0 — стоит, 1 — вытянута к зрителю. */
  out: number
}

export function spineColor(day: ShelfDay): THREE.Color {
  if (typeof day.color === 'number') return new THREE.Color(day.color)
  const name = typeof day.color === 'string' ? day.color : spineColorName(day.paletteHint, day.id)
  const c = CATALOG_COLORS[name] ?? (PALETTE as Record<string, number>)[name] ?? PALETTE.brick
  // корешок темнее светлых цветов палитры, чтобы читалась кожа
  const col = new THREE.Color(c)
  const hsl = { h: 0, s: 0, l: 0 }
  col.getHSL(hsl)
  if (hsl.l > 0.62) col.setHSL(hsl.h, hsl.s, 0.62)
  return col
}

/**
 * Цвет обложки книги дня — тот же, что у её корешка на полке (spineColor).
 * id — тот же id дня, что уходит на полку (нужен, только если в palette_hint одни светлые цвета).
 */
export function coverColorFor(script: Pick<DayScript, 'palette_hint'>, id = ''): THREE.Color {
  return spineColor({ id, title: '', paletteHint: script.palette_hint })
}

export class Shelf3D {
  readonly group = new THREE.Group()
  model: WorldModel | null = null
  private books: SpineBook[] = []
  private slots: THREE.Object3D[] = []
  private pending: ShelfDay[] | null = null
  private loading: Promise<void> | null = null

  constructor(private opts: { shadows?: boolean } = {}) {
    this.group.name = 'world_shelf'
    const at = WORLD.room.shelf.at
    if (at) this.group.position.set(...at)
  }

  /** Загрузить полку; книги расставятся, когда она придёт. */
  load() {
    return (this.loading ??= (async () => {
      const m = await loadWorldModel(WORLD.room.shelf.file, this.opts)
      if (!m) return
      this.model = m
      this.group.add(m.root)
      this.slots = []
      for (let i = 0; i < SHELF_SLOTS; i++) {
        const s = m.root.getObjectByName(`slot_book_${String(i).padStart(2, '0')}`)
        if (s) this.slots.push(s)
      }
      // книги стоят от правого края яруса (ближе к центру кадра: стоя на телефоне видна именно эта часть),
      // декор — слева
      // серия дней — семь книг в один ряд на верхнем ярусе (7-я не уезжает на другой ярус), дальше — нижний ярус
      const row0 = this.slots[0]?.position.clone()
      const row1 = this.slots[6]?.position.clone()
      this.slots.forEach((s, i) => {
        const top = i < BOOKS_PER_ROW
        const base = top ? row0 : row1
        if (base) s.position.set(BOOKS_RIGHT_X - (top ? i : i - BOOKS_PER_ROW) * BOOK_PITCH, base.y, base.z)
      })
      for (const name of ['slot_decor_0', 'slot_decor_1']) {
        const d = m.root.getObjectByName(name)
        if (d) d.position.x = -Math.abs(d.position.x)
      }
      if (this.pending) await this.place(this.pending)
    })())
  }

  /** Расставить дни по местам: последние 12, старые слева внизу. */
  async place(days: ShelfDay[]) {
    this.pending = days
    if (!this.model) return
    const want = days.slice(-SHELF_SLOTS)
    // убрать тех, кого больше нет
    for (const b of [...this.books]) {
      if (want.some((d) => d.id === b.day.id)) continue
      b.slot.remove(b.model.root)
      b.labelTex?.dispose()
      this.books.splice(this.books.indexOf(b), 1)
    }
    for (let i = 0; i < want.length; i++) {
      const day = want[i]
      const slot = this.slots[i]
      if (!slot) break
      let b = this.books.find((x) => x.day.id === day.id)
      if (!b) {
        const model = await loadWorldModel(WORLD.room.book_spine.file, this.opts)
        if (!model) return
        if (this.pending !== days) return
        b = {
          day,
          model,
          cover: ownMaterial(model.root, 'spine_cover'),
          label: ownMaterial(model.root, 'spine_label'),
          labelTex: null,
          slot,
          out: 0,
        }
        this.books.push(b)
      }
      b.day = day
      if (b.slot !== slot || b.model.root.parent !== slot) {
        b.slot = slot
        slot.add(b.model.root)
      }
      this.paint(b, i)
    }
  }

  private paint(b: SpineBook, index: number) {
    if (b.cover) b.cover.color.copy(spineColor(b.day))
    if (!b.label) return
    if (!b.labelTex) {
      const c = document.createElement('canvas')
      c.width = LABEL_W
      c.height = LABEL_H
      b.labelTex = new THREE.CanvasTexture(c)
      b.labelTex.colorSpace = THREE.SRGBColorSpace
      b.labelTex.anisotropy = 8
      b.label.map = b.labelTex
      b.label.color.set(0xffffff)
      b.label.needsUpdate = true
    }
    const c = b.labelTex.image as HTMLCanvasElement
    const g = c.getContext('2d')!
    g.fillStyle = '#f1e4c4'
    g.fillRect(0, 0, LABEL_W, LABEL_H)
    g.strokeStyle = 'rgba(58,38,24,0.75)'
    g.lineWidth = 3
    g.strokeRect(6, 6, LABEL_W - 12, LABEL_H - 12)
    g.fillStyle = '#3a2618'
    let size = 44
    const text = b.day.title || String(index + 1)
    do {
      g.font = `600 ${size}px ${FONT}`
      size -= 2
    } while (g.measureText(text).width > LABEL_W - 40 && size > 18)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, LABEL_W / 2, LABEL_H / 2 + 2)
    b.labelTex.needsUpdate = true
  }

  /** Место дня на полке (узел слота) — туда въезжает книга в финале. null — дня на полке нет. */
  slotOf(dayId: string): THREE.Object3D | null {
    return this.books.find((b) => b.day.id === dayId)?.slot ?? null
  }

  /** Свободное место для нового дня (после последнего), или null — полка полна. */
  nextSlot(): THREE.Object3D | null {
    return this.slots[this.books.length] ?? null
  }

  /** Корешок дня (чтобы спрятать его, пока книга дня лежит на столе). */
  bookOf(dayId: string): THREE.Object3D | null {
    return this.books.find((b) => b.day.id === dayId)?.model.root ?? null
  }

  /** Вытянуть корешок к зрителю: 0 — стоит, 1 — выдвинут и наклонён (выбор дня). */
  pull(dayId: string, k: number) {
    const b = this.books.find((x) => x.day.id === dayId)
    if (!b) return
    b.out = k
    const r = b.model.root
    r.position.z = 1.4 * k
    r.rotation.x = 0.12 * Math.sin(Math.min(1, k) * Math.PI * 0.5)
  }

  /**
   * Финал фильма, шаг 1: поставить день на полку (в следующее место) и вернуть его слот.
   * Корешок сразу прячется — он прилетит со стола через arrive().
   */
  async prepareArrival(day: ShelfDay): Promise<THREE.Object3D | null> {
    const days = this.pending ?? []
    if (!days.some((d) => d.id === day.id)) await this.place([...days, day])
    const root = this.bookOf(day.id)
    if (root) root.visible = false
    return this.slotOf(day.id)
  }

  /**
   * Финал фильма, шаг 2 (каждый кадр, k 0..1): закрытая книга летит со стола в своё место на полке.
   * from — мировая матрица закрытой книги на столе: начало у корешка, корешок вдоль Z, обложка вверх (+Y), страницы к +X.
   * Если у книги сцены другие оси — передай свою матрицу bookToSpine (пространство корешка → пространство книги).
   * На k = 0 корешок совпадает с книгой на столе (сцена прячет свою книгу), на k = 1 стоит в слоте.
   */
  arrive(dayId: string, from: THREE.Matrix4, k: number, bookToSpine: THREE.Matrix4 = BOOK_TO_SPINE) {
    const b = this.books.find((x) => x.day.id === dayId)
    if (!b) return
    const r = b.model.root
    r.visible = true
    b.slot.updateWorldMatrix(true, false)
    // начальная поза в пространстве слота
    const start = new THREE.Matrix4().copy(b.slot.matrixWorld).invert().multiply(from).multiply(bookToSpine)
    const p0 = new THREE.Vector3()
    const q0 = new THREE.Quaternion()
    const s0 = new THREE.Vector3()
    start.decompose(p0, q0, s0)
    const e = k * k * (3 - 2 * k)
    // дуга: вверх и к полке, в конце — вдвинуть в слот спереди
    const p1 = new THREE.Vector3(0, 0, 0)
    const lift = new THREE.Vector3(0, 2.2, 3.2)
    const a = p0.clone().lerp(lift, 0.5).add(new THREE.Vector3(0, 2.5, 0))
    const t = Math.min(1, e / 0.82)
    const pos = new THREE.Vector3()
    if (e < 0.82) {
      // квадратичная кривая Безье p0 → a → lift
      pos.copy(p0).multiplyScalar((1 - t) * (1 - t)).addScaledVector(a, 2 * (1 - t) * t).addScaledVector(lift, t * t)
    } else {
      const u = (e - 0.82) / 0.18
      pos.copy(lift).lerp(p1, u)
      pos.y = lift.y * (1 - u) * (1 - u)
    }
    r.position.copy(pos)
    r.quaternion.copy(q0).slerp(new THREE.Quaternion(), Math.min(1, e / 0.75))
    if (k >= 1) {
      r.position.set(0, 0, 0)
      r.quaternion.identity()
    }
  }

  /** Мировая матрица места: позиция и поворот, куда ставить книгу. */
  slotWorld(dayId: string, target = new THREE.Matrix4()): THREE.Matrix4 | null {
    const s = this.slotOf(dayId)
    if (!s) return null
    s.updateWorldMatrix(true, false)
    return target.copy(s.matrixWorld)
  }

  get days() {
    return this.books.map((b) => b.day)
  }

  dispose() {
    for (const b of this.books) b.labelTex?.dispose()
  }
}
