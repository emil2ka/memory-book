import * as THREE from 'three'
import { PALETTE, css } from './palette'
import { HD, pixelTexture } from './PixelStage'
import { poseClip, type Model } from './models'

/** Размер одной страницы в единицах мира. */
export const PAGE_W = 3.2
export const PAGE_H = 4.2
/** Разрешение текстуры одной страницы. */
export const TEX_W = 160
export const TEX_H = 210
const PAGE_Y = 0.285
/** В пробе HD страницы рисуются в 4 раза подробнее и рукописным шрифтом. */
export const SS = HD ? 4 : 1
/** Рукописный шрифт уже и ниже моноширинного, поэтому кегли крупнее, а строки плотнее. */
const FONT_SIZES = HD ? [24, 21, 18, 16, 14, 12, 10] : [16, 14, 12, 10, 8, 7]
const LH = HD ? 1.12 : 1.35
export const HAND_FONT = 'Caveat'
const MARGIN = 12

export interface WordBox {
  index: number
  word: string
  /** Позиция слова в исходном тексте. */
  start: number
  end: number
  /** 0 — левая страница, 1 — правая. */
  page: 0 | 1
  /** Прямоугольник на текстуре страницы, пиксели. */
  x: number
  y: number
  w: number
  h: number
}

/**
 * ЗАГЛУШКА книги: коробки и плоскости. Настоящая модель с ригом придёт из assets/models.
 * Левая половина (обложка + страница) закрывается поворотом вокруг корешка.
 */
export class Book {
  readonly group = new THREE.Group()
  /** Левая половина; rotation.z = 0 — раскрыта, -PI — лежит на правой (книга закрыта). */
  readonly leftHalf = new THREE.Group()
  readonly coverTitle: THREE.Mesh
  private canvases = [document.createElement('canvas'), document.createElement('canvas')]
  private textures: THREE.Texture[]
  private titleCanvas = document.createElement('canvas')
  private titleTex: THREE.Texture
  private modelTitle: THREE.Mesh | null = null
  private words: WordBox[] = []
  private hidden = new Set<number>()
  private text = ''
  /** 0 — закрыта, 1 — раскрыта. */
  openK = 0
  /** Высота поверхности страниц над основанием книги. */
  surfaceY = PAGE_Y
  private model: Model | null = null
  private boxes: THREE.Object3D[] = []
  private titlePlate: THREE.Mesh | null = null
  private caretPos: number | null = null
  private caretOn = true
  private fontPx = 14
  fontFamily = 'monospace'
  /** false — правая страница занята фото, текст только на левой. */
  textOnRightPage = true

  constructor() {
    const paperSide = new THREE.MeshLambertMaterial({ color: PALETTE.paperShade })
    const coverMat = new THREE.MeshLambertMaterial({ color: PALETTE.brickDark })
    for (const c of this.canvases) {
      c.width = TEX_W * SS
      c.height = TEX_H * SS
      c.getContext('2d')!.scale(SS, SS)
    }
    if (HD) {
      this.fontFamily = `${HAND_FONT}, "Bradley Hand", "Segoe Print", cursive`
      // шрифт подгружается с сети: когда придёт, текст перерисовывается им
      document.fonts?.load(`24px ${HAND_FONT}`, 'Аәғқңөұүһі').then(() => this.refresh())
    }
    this.textures = this.canvases.map((c) => pixelTexture(c, HD))

    const half = (side: -1 | 1, tex: THREE.Texture) => {
      const g = new THREE.Group()
      const cover = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W + 0.15, 0.1, PAGE_H + 0.3), coverMat)
      cover.position.set((side * (PAGE_W + 0.15)) / 2, 0.05, 0)
      const block = new THREE.Mesh(new THREE.BoxGeometry(PAGE_W, 0.17, PAGE_H), paperSide)
      block.position.set((side * PAGE_W) / 2, 0.19, 0)
      const geo = new THREE.PlaneGeometry(PAGE_W, PAGE_H)
      geo.rotateX(-Math.PI / 2)
      const page = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }))
      page.position.set((side * PAGE_W) / 2, PAGE_Y, 0)
      g.add(cover, block, page)
      return g
    }
    // ось поворота левой половины — на уровне поверхности страниц, иначе обложка уйдёт под стол
    const leftInner = half(-1, this.textures[0])
    leftInner.position.y = -PAGE_Y
    this.leftHalf.position.y = PAGE_Y
    this.leftHalf.add(leftInner)
    const rightHalf = half(1, this.textures[1])
    this.group.add(this.leftHalf, rightHalf)
    this.boxes.push(this.leftHalf, rightHalf)

    // табличка названия на внешней стороне левой обложки (видна, когда книга закрыта)
    this.titleCanvas.width = 128 * SS
    this.titleCanvas.height = 64 * SS
    this.titleTex = pixelTexture(this.titleCanvas, HD)
    const tg = new THREE.PlaneGeometry(2.4, 1.2)
    tg.rotateX(Math.PI / 2)
    this.coverTitle = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ map: this.titleTex, transparent: true }))
    this.coverTitle.position.set(-PAGE_W / 2, -PAGE_Y - 0.005, 0)
    this.coverTitle.rotation.y = Math.PI
    this.coverTitle.visible = false
    this.leftHalf.add(this.coverTitle)

    this.setText('')
  }

  /** Заменить коробки настоящей моделью. Текст рисуется на материалах page_left и page_right. */
  useModel(model: Model) {
    this.model = model
    if (HD) model.root.traverse((o) => ((o.castShadow = true), (o.receiveShadow = true)))
    for (const b of this.boxes) b.visible = false
    this.group.add(model.root)
    poseClip(model, 'Open', 1)
    model.root.updateMatrixWorld(true)
    model.root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const name = (mesh.material as THREE.Material).name
      const page = name === 'page_left' ? 0 : name === 'page_right' ? 1 : -1
      if (page >= 0) {
        ;(mesh.material as THREE.MeshStandardMaterial).map = this.textures[page]
        if (page === 1) this.surfaceY = new THREE.Box3().setFromObject(mesh).max.y - this.group.position.y + 0.005
      }
      if (mesh.name === 'title_plate') this.titlePlate = mesh
    })
    // название — своя плоскость поверх таблички закрытой книги (у таблички развёртка под атлас)
    if (this.titlePlate) {
      poseClip(model, 'Open', 0)
      model.root.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(this.titlePlate)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const geo = new THREE.PlaneGeometry(size.x, size.z)
      geo.rotateX(-Math.PI / 2)
      this.modelTitle = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: this.titleTex }))
      this.modelTitle.position.set(center.x - this.group.position.x, box.max.y - this.group.position.y + 0.004, center.z)
      this.modelTitle.visible = false
      this.group.add(this.modelTitle)
    }
    poseClip(model, 'Open', this.openK)
  }

  get pageY() {
    return this.group.position.y + this.surfaceY
  }

  /** 0 — закрыта, 1 — раскрыта. */
  setOpen(k: number) {
    this.openK = k
    this.leftHalf.rotation.z = -Math.PI * (1 - k)
    if (this.model) poseClip(this.model, 'Open', k)
  }

  setTitle(title: string, alpha = 1) {
    const W = this.titleCanvas.width
    const H = this.titleCanvas.height
    const k = W / 128
    const g = this.titleCanvas.getContext('2d')!
    g.clearRect(0, 0, W, H)
    g.fillStyle = css(PALETTE.cream)
    g.fillRect(0, 0, W, H)
    g.fillStyle = css(PALETTE.brickDark)
    const size = (HD ? 17 : 12) * k
    g.font = `${size}px ${this.fontFamily}`
    g.textAlign = 'center'
    const lines = wrap(g, title, 112 * k)
    lines.forEach((l, n) => g.fillText(l, W / 2, H / 2 + size * 0.3 - ((lines.length - 1) * size * 1.05) / 2 + n * size * 1.05))
    this.titleTex.needsUpdate = true
    this.coverTitle.visible = alpha > 0 && !this.model
    if (this.modelTitle) this.modelTitle.visible = alpha > 0
    ;(this.coverTitle.material as THREE.MeshBasicMaterial).opacity = alpha
  }

  /** Раскладывает текст по двум страницам и запоминает прямоугольник каждого слова. */
  setText(text: string): WordBox[] {
    this.text = text
    this.hidden.clear()
    const ctx = this.canvases[0].getContext('2d')!
    const tokens = [...text.matchAll(/\S+/g)]
    // размер шрифта подбирается так, чтобы текст поместился на разворот
    for (const px of FONT_SIZES) {
      this.fontPx = px
      if (this.layout(ctx, tokens)) break
    }
    this.redraw()
    return this.words
  }

  private layout(ctx: CanvasRenderingContext2D, tokens: RegExpMatchArray[]): boolean {
    ctx.font = `${this.fontPx}px ${this.fontFamily}`
    const lh = Math.round(this.fontPx * LH)
    const maxW = TEX_W - MARGIN * 2
    const space = ctx.measureText(' ').width
    const words: WordBox[] = []
    let page: 0 | 1 = 0
    let x = MARGIN
    let y = MARGIN + lh
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i]
      const w = Math.ceil(ctx.measureText(tok[0]).width)
      if (x + w > MARGIN + maxW && x > MARGIN) {
        x = MARGIN
        y += lh
        if (y > TEX_H - MARGIN) {
          if (page === 1 || !this.textOnRightPage) return false
          page = 1
          y = MARGIN + lh
        }
      }
      words.push({ index: i, word: tok[0], start: tok.index!, end: tok.index! + tok[0].length, page, x, y: y - this.fontPx, w, h: this.fontPx + 2 })
      x += w + space
    }
    this.words = words
    return true
  }

  /** Курсор после символа pos исходного текста; null — спрятать. */
  setCaret(pos: number | null) {
    this.caretPos = pos
    this.caretOn = true
    this.redraw()
  }

  /** Мигание курсора: вызывается сценой. */
  blinkCaret(on: boolean) {
    if (this.caretPos === null || on === this.caretOn) return
    this.caretOn = on
    this.redraw()
  }

  private caretBox(ctx: CanvasRenderingContext2D): { page: 0 | 1; x: number; y: number } | null {
    if (this.caretPos === null) return null
    const pos = this.caretPos
    const lh = Math.round(this.fontPx * LH)
    let prev: WordBox | null = null
    for (const w of this.words) {
      if (w.start >= pos) break
      prev = w
    }
    if (!prev) return { page: 0, x: MARGIN, y: MARGIN + lh - this.fontPx }
    const inside = Math.min(pos - prev.start, prev.word.length)
    const x = prev.x + Math.ceil(ctx.measureText(prev.word.slice(0, inside)).width) + (pos > prev.end ? Math.ceil(ctx.measureText(' ').width) : 0)
    return { page: prev.page, x, y: prev.y }
  }

  /** Переразложить текущий текст (например, после загрузки шрифта), сохранив вытянутые слова. */
  refresh() {
    const hidden = new Set(this.hidden)
    this.setText(this.text)
    this.hidden = hidden
    this.redraw()
  }

  getWords() {
    return this.words
  }

  /** Слова, которые покрывает цитата (подстрока текста). */
  wordsForQuote(quote: string): WordBox[] {
    const at = this.text.toLowerCase().indexOf(quote.toLowerCase())
    if (at < 0) return []
    const end = at + quote.length
    return this.words.filter((w) => w.start < end && w.end > at)
  }

  hideWords(boxes: WordBox[]) {
    for (const b of boxes) this.hidden.add(b.index)
    this.redraw()
  }

  /** Центр группы слов в координатах мира, на поверхности страницы. Берётся страница первого слова. */
  wordWorldPosition(boxes: WordBox[]): THREE.Vector3 | null {
    if (!boxes.length) return null
    const page = boxes[0].page
    const on = boxes.filter((b) => b.page === page)
    const x0 = Math.min(...on.map((b) => b.x))
    const x1 = Math.max(...on.map((b) => b.x + b.w))
    const y0 = Math.min(...on.map((b) => b.y))
    const y1 = Math.max(...on.map((b) => b.y + b.h))
    const u = (x0 + x1) / 2 / TEX_W
    const v = (y0 + y1) / 2 / TEX_H
    // фильм всегда идёт на раскрытой книге в начале координат, поэтому сдвиг закрытой книги не учитывается
    return new THREE.Vector3((page === 0 ? -PAGE_W : 0) + u * PAGE_W, this.surfaceY, -PAGE_H / 2 + v * PAGE_H)
  }

  /** Углы страницы в координатах мира: [левый-дальний, правый-дальний, правый-ближний, левый-ближний]. */
  pageCorners(page: 0 | 1): THREE.Vector3[] {
    const x0 = page === 0 ? -PAGE_W : 0
    return [
      [x0, -PAGE_H / 2],
      [x0 + PAGE_W, -PAGE_H / 2],
      [x0 + PAGE_W, PAGE_H / 2],
      [x0, PAGE_H / 2],
    ].map(([x, z]) => this.group.localToWorld(new THREE.Vector3(x, this.surfaceY, z)))
  }

  /** Холст с буквами слов — для спрайта, который поднимается со страницы. */
  wordCanvas(boxes: WordBox[]): HTMLCanvasElement {
    const label = boxes.map((b) => b.word).join(' ')
    const c = document.createElement('canvas')
    const font = `${this.fontPx * SS}px ${this.fontFamily}`
    const g = c.getContext('2d')!
    g.font = font
    c.width = Math.ceil(g.measureText(label).width) + 4 * SS
    c.height = Math.ceil(this.fontPx * SS * 1.3)
    const g2 = c.getContext('2d')!
    g2.font = font
    g2.fillStyle = css(PALETTE.navy)
    g2.fillText(label, 2 * SS, this.fontPx * SS)
    return c
  }

  private redraw() {
    const lh = Math.round(this.fontPx * LH)
    this.canvases.forEach((canvas, page) => {
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = css(PALETTE.paper)
      ctx.fillRect(0, 0, TEX_W, TEX_H)
      ctx.fillStyle = css(PALETTE.paperShade)
      for (let y = MARGIN + lh + 3; y < TEX_H - 6; y += lh) ctx.fillRect(8, y, TEX_W - 16, 1)
      ctx.font = `${this.fontPx}px ${this.fontFamily}`
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = css(PALETTE.navy)
      for (const w of this.words) {
        if (w.page !== page || this.hidden.has(w.index)) continue
        ctx.fillText(w.word, w.x, w.y + this.fontPx)
      }
      const caret = this.caretOn ? this.caretBox(ctx) : null
      if (caret && caret.page === page) ctx.fillRect(Math.min(caret.x, TEX_W - 4), caret.y + 1, 1, this.fontPx + 2)
      this.textures[page].needsUpdate = true
    })
  }
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/)) {
    const next = line ? `${line} ${w}` : w
    if (g.measureText(next).width > maxW && line) {
      out.push(line)
      line = w
    } else line = next
  }
  if (line) out.push(line)
  return out.slice(0, 3)
}
