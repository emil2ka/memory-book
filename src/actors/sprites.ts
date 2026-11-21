import heroBaseUrl from '../../assets/sprites/hero_base.png'
import heroBaseMeta from '../../assets/sprites/hero_base.json'
import heroActUrl from '../../assets/sprites/hero_actions.png'
import heroActMeta from '../../assets/sprites/hero_actions.json'
import hero2Url from '../../assets/sprites/hero2_base.png'
import hero2Meta from '../../assets/sprites/hero2_base.json'
import items1Url from '../../assets/sprites/items1.png'
import items1Meta from '../../assets/sprites/items1.json'
import items2Url from '../../assets/sprites/items2.png'
import items2Meta from '../../assets/sprites/items2.json'
import popupsUrl from '../../assets/sprites/popups.png'
import popupsMeta from '../../assets/sprites/popups.json'
import effectsUrl from '../../assets/sprites/effects.png'
import effectsMeta from '../../assets/sprites/effects.json'
import { SpriteActor } from './SpriteActor'

export type HeroRow = 'idle' | 'walk' | 'pull' | 'sit' | 'shake' | 'carry' | 'drink' | 'shiver' | 'cheer'
export type HeroKind = 'hero' | 'second'
export const HERO_COLS = 6
export const EFFECT_COLS = effectsMeta.cols
/** Pop-up крупнее предметов, но мельче человечка в пересчёте на пиксель: бумажная вырезка на странице. */
const POPUP_WORLD_PER_PX = 0.03

interface SheetMeta {
  cell: number[]
  cols: number
  rows: number
  frames: { name?: string; col: number; row: number }[]
}

interface HeroSheet {
  canvas: HTMLCanvasElement
  rows: Partial<Record<HeroRow, number>>
  rowCount: number
  /** Размер ячейки листа в пикселях. */
  cell: [number, number]
}

function load(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`не загрузился спрайт ${url}`))
    img.src = url
  })
}

/** Имя ряда — имя первого кадра без номера: «walk_0» → «walk». */
function rowNames(meta: SheetMeta): string[] {
  const out: string[] = []
  for (const f of meta.frames) if (f.col === 0) out[f.row] = (f.name ?? '').replace(/_\d+$/, '')
  return out
}

/** Склеивает листы человечка по вертикали в один атлас, чтобы анимации переключались без смены текстуры. */
function heroAtlas(parts: { img: HTMLImageElement; meta: SheetMeta }[]): HeroSheet {
  const rowCount = parts.reduce((n, p) => n + p.meta.rows, 0)
  const [cw, ch] = parts[0].meta.cell
  const canvas = document.createElement('canvas')
  canvas.width = cw * HERO_COLS
  canvas.height = ch * rowCount
  const g = canvas.getContext('2d')!
  const rows: Partial<Record<HeroRow, number>> = {}
  let y = 0
  for (const p of parts) {
    g.drawImage(p.img, 0, y * ch)
    rowNames(p.meta).forEach((name, i) => (rows[name as HeroRow] = y + i))
    y += p.meta.rows
  }
  return { canvas, rows, rowCount, cell: [cw, ch] }
}

/** Загруженные листы спрайтов и фабрики актёров. */
export class SpriteBank {
  private items = new Map<string, { img: HTMLImageElement; meta: SheetMeta; col: number; row: number }>()
  private popups = new Map<string, { col: number; row: number }>()
  private effectRows = new Map<string, number>()

  private constructor(
    private heroes: Record<HeroKind, HeroSheet>,
    itemSheets: { img: HTMLImageElement; meta: SheetMeta }[],
    private popupImg: HTMLImageElement,
    private effectImg: HTMLImageElement,
  ) {
    for (const s of itemSheets) for (const f of s.meta.frames) if (f.name) this.items.set(f.name, { ...s, col: f.col, row: f.row })
    for (const f of popupsMeta.frames) if (f.name) this.popups.set(f.name, { col: f.col, row: f.row })
    rowNames(effectsMeta).forEach((name, i) => this.effectRows.set(name, i))
  }

  static async load(): Promise<SpriteBank> {
    const [hb, ha, h2, i1, i2, pp, fx] = await Promise.all(
      [heroBaseUrl, heroActUrl, hero2Url, items1Url, items2Url, popupsUrl, effectsUrl].map(load),
    )
    return new SpriteBank(
      {
        hero: heroAtlas([
          { img: hb, meta: heroBaseMeta },
          { img: ha, meta: heroActMeta },
        ]),
        second: heroAtlas([{ img: h2, meta: hero2Meta }]),
      },
      [
        { img: i1, meta: items1Meta },
        { img: i2, meta: items2Meta },
      ],
      pp,
      fx,
    )
  }

  makeHero(kind: HeroKind): SpriteActor {
    const sheet = this.heroes[kind]
    const a = new SpriteActor(sheet.canvas, sheet.cell[0], sheet.cell[1])
    this.setHeroFrame(a, kind, 'idle', 0)
    return a
  }

  /** Если у листа нет нужного ряда — показывается idle. */
  setHeroFrame(a: SpriteActor, kind: HeroKind, row: HeroRow, col: number) {
    const sheet = this.heroes[kind]
    a.setFrame(col % HERO_COLS, sheet.rows[row] ?? sheet.rows.idle ?? 0, HERO_COLS, sheet.rowCount)
  }

  makeItem(id: string): SpriteActor | null {
    const f = this.items.get(id)
    if (!f) return null
    const a = new SpriteActor(f.img, f.meta.cell[0], f.meta.cell[1])
    a.setFrame(f.col, f.row, f.meta.cols, f.meta.rows)
    return a
  }

  makePopup(id: string): SpriteActor | null {
    const f = this.popups.get(id)
    if (!f) return null
    const a = new SpriteActor(this.popupImg, popupsMeta.cell[0], popupsMeta.cell[1], POPUP_WORLD_PER_PX)
    a.setFrame(f.col, f.row, popupsMeta.cols, popupsMeta.rows)
    return a
  }

  makeEffect(id: string): SpriteActor | null {
    if (!this.effectRows.has(id)) return null
    const a = new SpriteActor(this.effectImg, effectsMeta.cell[0], effectsMeta.cell[1])
    this.setEffectFrame(a, id, 0)
    return a
  }

  setEffectFrame(a: SpriteActor, id: string, col: number) {
    a.setFrame(Math.min(col, EFFECT_COLS - 1), this.effectRows.get(id) ?? 0, EFFECT_COLS, effectsMeta.rows)
  }
}
