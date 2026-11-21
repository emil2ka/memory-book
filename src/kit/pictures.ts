// Картинки библиотеки в браузере: SVG из assets/kit2d (их рисует Claude заранее) + поля поиска из библиотеки кита.
import type { KitModel } from './format'
import { KIT_LIBRARY, kitById } from './library'
import { svgDataUrl, type KitPicture } from './svg'

const files = import.meta.glob('../../assets/kit2d/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const SVG = new Map<string, string>(Object.entries(files).map(([p, s]) => [p.split('/').pop()!.replace(/\.svg$/, ''), s]))

const toPicture = (m: KitModel, svg: string): KitPicture => {
  const { parts: _parts, ...meta } = m
  return { ...meta, svg, by: m.by === 'claude' ? 'claude' : 'library' }
}

/** Все предметы библиотеки, у которых есть картинка. */
export const PICTURES: readonly KitPicture[] = KIT_LIBRARY.filter((m) => SVG.has(m.id)).map((m) => toPicture(m, SVG.get(m.id)!))

/** Картинка по id библиотеки (или null, если её ещё не нарисовали). */
export function pictureById(id: string): KitPicture | null {
  const m = kitById(id)
  const svg = SVG.get(id)
  return m && svg ? toPicture(m, svg) : null
}

export const pictureUrl = (p: KitPicture) => svgDataUrl(p.svg)
