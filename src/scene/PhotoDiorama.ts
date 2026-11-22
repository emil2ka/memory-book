// Фото → диорама (план 14, роль фото): Haiku описывает снимок дня карточкой словами 3D-библиотеки
// (eval/photo-probe.ts), код собирает из неё крошечную объёмную сцену: место сзади, вещи с фото,
// люди с фото — пиксельными человечками в цветах их одежды (лиц нет, одна вещь на голове).
import * as THREE from 'three'
import { Hero3D, type HeroAction, type HeroColors } from '../actors/Hero3D'
import type { PhotoCard, PhotoPerson } from '../types/script'
import { buildKit, kitBounds } from '../kit/build'
import { KIT_UNIT, type KitModel, type PaletteName } from '../kit/format'
import { kitById } from '../kit/library'
import { sceneRef } from '../kit/sceneCheck'
import { toonFor, toPixelLayer } from '../render/PixelLayer'

// карточка снимка — общий контракт (src/types/script.ts, mb-logic)
export type { PhotoCard, PhotoPerson } from '../types/script'

/** Тёмный оттенок цвета одежды — для складок и рукавов. */
const DARK: Partial<Record<PaletteName, PaletteName>> = {
  brick: 'brickDark', brickDark: 'ink', coral: 'brick', peach: 'coral', green: 'greenDark', greenSoft: 'green', mint: 'greenSoft',
  teal: 'tealDark', tealDark: 'ink', slate: 'slateDark', greyBlue: 'slateDark', navy: 'ink', brown: 'brownDark', wood: 'brown',
  ochre: 'wood', amber: 'ochre', yellow: 'ochre', cream: 'paperShade', paper: 'paperShade', white: 'greyLight', grey: 'slateDark',
  greyLight: 'grey', plum: 'ink', mauve: 'plum', ice: 'greyBlue', frost: 'ice', skin: 'skinShade',
}
const dark = (c: PaletteName): PaletteName => DARK[c] ?? 'ink'

/** Цвета человечка по одежде с фото. */
export function colorsFromPhoto(p: PhotoPerson): HeroColors {
  return {
    skin: 'skin',
    hair: p.hair,
    jacket: p.jacket,
    jacketDark: dark(p.jacket),
    scarf: p.scarf,
    scarfDark: dark(p.scarf),
    trousers: p.jacket === 'navy' ? 'slateDark' : 'navy',
    boots: 'brownDark',
  }
}

const model = (ref: string): KitModel | null => {
  if (!ref) return null
  const m = sceneRef(ref) ?? kitById(ref)
  return m && m.parts.length ? m : null
}

/** Поставить предмет кита нужной высоты (в единицах кита; плоское — по ширине). */
function place(m: KitModel, height: number) {
  const o = buildKit(m, toonFor)
  toPixelLayer(o)
  const s = kitBounds(m).getSize(new THREE.Vector3())
  const flat = s.y < 0.45 * Math.max(s.x, s.z)
  o.scale.setScalar(height / (flat ? Math.max(s.x, s.z) : s.y))
  return { obj: o, w: Math.max(s.x, s.z) * o.scale.x * KIT_UNIT }
}

/**
 * Собрать диораму. Начало координат — центр сценки на бумаге, +Z к зрителю.
 * Сзади место, перед ним вещи с фото, в ряд — люди с фото и (если hero дан) главный человечек.
 */
export function buildDiorama(card: PhotoCard, opts: { time?: number } = {}) {
  const group = new THREE.Group()
  group.name = 'photo_diorama'
  const figures: Hero3D[] = []
  // место: крупно сзади
  const pm = model(card.place.ref)
  let backW = 1.6
  if (pm) {
    const { obj, w } = place(pm, 40)
    obj.position.set(0, 0, -0.55)
    group.add(obj)
    backW = Math.max(backW, w)
  }
  // вещи: небо — над сценой, стена — по бокам места, остальное — в первом ряду, игрушечно крупно
  const front: THREE.Object3D[] = []
  let wallSide = 1
  const seen = new Map<string, number>()
  for (const t of card.things) {
    const m = model(t.ref)
    if (!m) continue
    const n = (seen.get(m.id) ?? 0) + 1
    seen.set(m.id, n)
    if (n > 2) continue
    if (t.where === 'sky') {
      const { obj } = place(m, 20)
      obj.position.set(-0.5 + front.length * 0.2, 1.45, -0.4)
      group.add(obj)
    } else if (t.where === 'wall') {
      const { obj } = place(m, 18)
      obj.position.set(wallSide * (backW / 2 + 0.2), 0.35, -0.7)
      wallSide = -wallSide
      group.add(obj)
    } else {
      // вещи со стола — в первый ряд, игрушечно, но ниже лиц людей
      const { obj } = place(m, 10)
      front.push(obj)
      group.add(obj)
    }
  }
  front.forEach((o, i) => o.position.set((i - (front.length - 1) / 2) * 0.34, 0, 0.62))
  // люди с фото: в ряд перед местом, лицом к зрителю, в позе с фото
  const t = opts.time ?? 0.6
  const people = card.people.slice(0, 3)
  people.forEach((p, i) => {
    const fig = new Hero3D(colorsFromPhoto(p), toonFor, p.accessory)
    // сидят без стула — стоят спокойно
    const act: HeroAction = p.action === 'sit' ? 'idle' : p.action
    fig.object.position.set((i - (people.length - 1) / 2) * 0.62, 0, 0.05)
    fig.object.rotation.y = (i - (people.length - 1) / 2) * -0.18
    fig.play(act, 0, 1.2)
    fig.update(t, 0.016, 0, 0)
    group.add(fig.object)
    figures.push(fig)
  })
  return { group, figures }
}
