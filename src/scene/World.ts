import type { DayScript } from '../types/script'
import { choreograph } from '../timeline/choreograph'
import { TimelinePlayer } from '../timeline/Player'
import { FilmStage } from './FilmStage'
import { PixelStage } from './PixelStage'
import type { SpriteBank } from '../actors/sprites'

/** Собирает мир, крутит цикл кадров и проигрывает день через таймлайн. */
export class World {
  readonly px: PixelStage
  readonly film: FilmStage
  player: TimelinePlayer | null = null

  constructor(host: HTMLElement, bank: SpriteBank | null = null) {
    this.px = new PixelStage(host)
    this.film = new FilmStage(this.px, bank)
    this.px.onTick((_time, dt) => {
      if (this.player) this.player.tick()
      else this.film.update(0, dt)
    })
    this.px.start()
  }

  /**
   * Проиграть день. clock — источник времени в секундах (например, время песни);
   * без него проигрыватель идёт по своим часам.
   */
  playDay(
    text: string,
    script: DayScript,
    opts: { seed?: number; beatTimes?: number[]; clock?: () => number; photoCount?: number; dayId?: string } = {},
  ) {
    const timeline = choreograph(script, { seed: opts.seed ?? 1, beatTimes: opts.beatTimes, photoCount: opts.photoCount ?? 0 })
    this.film.preload(timeline, text)
    this.film.dress(script, opts.seed ?? 1, opts.dayId ?? null)
    const player = new TimelinePlayer(opts.clock ? { clock: opts.clock } : {})
    player.load(timeline, this.film, text.trim())
    player.play()
    this.player = player
    return player
  }

  /** Режим записи: фильм остановлен, книга раскрыта, камера сверху на разворот. */
  enterWriteMode() {
    this.player?.pause()
    this.player = null
    this.film.writeView()
  }

  /** Черновик текста на страницах (в режиме записи). */
  setDraftText(text: string) {
    this.film.setDraftText(text)
  }

  /** Чернильный курсор после символа pos в тексте черновика; null — спрятать. */
  setDraftCaret(pos: number | null) {
    this.film.setDraftCaret(pos)
  }

  /** Полароиды на правой странице; остаются и на время фильма. Пустой массив убирает их. */
  setDraftPhotos(images: (HTMLImageElement | HTMLCanvasElement)[]) {
    this.film.setPhotos(images)
  }

  /** Человек сел и не занят разовым движением — можно показывать подсказки поверх. */
  get personSettled() {
    return this.film.personSettled
  }

  /** Кто пишет за столом: мальчик или девочка. */
  setPerson(kind: 'boy' | 'girl') {
    this.film.setPersonKind(kind)
  }

  /** Дни на 3D-полке (старые первыми). Вызывать при каждом изменении списка дней. */
  setShelf(days: { id: string; title: string; paletteHint?: string[] }[]) {
    this.film.setShelf(days)
  }

  private shelfPicks = new Set<(dayId: string) => void>()
  private bookPicks = new Set<() => void>()
  private pointerOff: (() => void) | null = null

  /**
   * Клик или тап по книге на 3D-полке (только на экране полки). Наведение подсвечивает книгу —
   * она выезжает к зрителю, курсор становится рукой. Возвращает функцию отписки.
   */
  onShelfPick(cb: (dayId: string) => void): () => void {
    this.shelfPicks.add(cb)
    this.listenPointer()
    return () => {
      this.shelfPicks.delete(cb)
    }
  }

  /** Клик или тап по закрытой книге на столе (экран полки) — начать запись. Возвращает отписку. */
  onBookPick(cb: () => void): () => void {
    this.bookPicks.add(cb)
    this.listenPointer()
    return () => {
      this.bookPicks.delete(cb)
    }
  }

  /** Один набор обработчиков на холсте для полки и книги. */
  private listenPointer() {
    if (this.pointerOff) return
    const canvas = this.px.renderer.domElement
    type Hit = { kind: 'shelf'; id: string } | { kind: 'book' } | null
    const hitAt = (e: PointerEvent): Hit => {
      const r = canvas.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * 2 - 1
      const y = -((e.clientY - r.top) / r.height) * 2 + 1
      const id = this.shelfPicks.size ? this.film.pickShelf(x, y) : null
      if (id) return { kind: 'shelf', id }
      if (this.bookPicks.size && this.film.pickBook(x, y)) return { kind: 'book' }
      return null
    }
    const show = (h: Hit) => {
      this.film.setShelfHover(h?.kind === 'shelf' ? h.id : null)
      this.film.setBookHover(h?.kind === 'book')
      canvas.style.cursor = h ? 'pointer' : ''
    }
    const same = (a: Hit, b: Hit) => !!a && !!b && a.kind === b.kind && (a.kind !== 'shelf' || (b.kind === 'shelf' && a.id === b.id))
    let down: { x: number; y: number; hit: Hit } | null = null
    const move = (e: PointerEvent) => show(hitAt(e))
    const press = (e: PointerEvent) => {
      // на сенсорном экране наведения нет: подсветка появляется при касании
      down = { x: e.clientX, y: e.clientY, hit: hitAt(e) }
      show(down.hit)
    }
    const release = (e: PointerEvent) => {
      const d = down
      down = null
      if (!d || !d.hit || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return
      const h = hitAt(e)
      if (!same(h, d.hit)) return
      if (h!.kind === 'shelf') for (const cb of this.shelfPicks) cb(h!.id)
      else for (const cb of this.bookPicks) cb()
    }
    const leave = () => show(null)
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerdown', press)
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointerleave', leave)
    this.pointerOff = () => {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerdown', press)
      canvas.removeEventListener('pointerup', release)
      canvas.removeEventListener('pointerleave', leave)
    }
  }

  /** Книга закрыта, общий план — для полки. */
  idle() {
    this.player?.pause()
    this.player = null
    this.film.idleView()
  }

  /** Прямоугольники страниц в CSS-пикселях относительно host; scale — CSS-пикселей на пиксель сцены. */
  pageRects() {
    const canvas = this.px.renderer.domElement
    const c = canvas.getBoundingClientRect()
    const h = canvas.parentElement!.getBoundingClientRect()
    const scale = c.width / canvas.width
    const px = this.film.pageRectsPx()
    const map = (r: { x: number; y: number; w: number; h: number }) => ({
      x: c.left - h.left + r.x * scale,
      y: c.top - h.top + r.y * scale,
      w: r.w * scale,
      h: r.h * scale,
    })
    return { left: map(px.left), right: map(px.right), scale }
  }

  dispose() {
    this.pointerOff?.()
    this.player?.pause()
    this.px.dispose()
  }
}
