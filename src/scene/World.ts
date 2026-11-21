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
  playDay(text: string, script: DayScript, opts: { seed?: number; beatTimes?: number[]; clock?: () => number; photoCount?: number } = {}) {
    const timeline = choreograph(script, { seed: opts.seed ?? 1, beatTimes: opts.beatTimes, photoCount: opts.photoCount ?? 0 })
    this.film.preload(timeline)
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
    this.player?.pause()
    this.px.dispose()
  }
}
