// Какие файлы берём как фото и как объясняем, если не открылись (план 13 § 5: порядок, вертикальные, HEIC).
// Вертикальные снимки поворачивает decode() в resize.ts (imageOrientation: 'from-image', EXIF).

/** HEIC/HEIF с айфона: у Chrome и Firefox тип часто пустой, поэтому смотрим и на расширение. */
export const isHeic = (f: { name: string; type: string }) => /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name)

/** Картинка ли это: по типу или (тип пустой) по расширению. */
export const isImageFile = (f: { name: string; type: string }) =>
  f.type.startsWith('image/') || isHeic(f) || (!f.type && /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(f.name))

/** Порядок дня: по времени файла (снято раньше — раньше в фильме), при равенстве — как выбрали. */
export const byTakenTime = <T extends { lastModified: number }>(files: T[]): T[] =>
  files.map((f, i) => ({ f, i })).sort((a, b) => a.f.lastModified - b.f.lastModified || a.i - b.i).map((x) => x.f)

/** Короткая подпись для листка под карточкой фото, если что-то не открылось. */
export function photoProblem(failed: { name: string; type: string }[], skipped: number): string {
  const parts: string[] = []
  const heic = failed.filter(isHeic).length
  const other = failed.length - heic
  if (heic) parts.push(`${heic === 1 ? 'фото HEIC' : `${heic} фото HEIC`} не открывается в этом браузере — сохрани как JPG или открой в Safari`)
  if (other) parts.push(`${other === 1 ? 'одно фото не открылось' : `${other} фото не открылись`} — попробуй JPG или PNG`)
  if (skipped) parts.push(`взяла первые, лишние ${skipped} не поместились: не больше 5 фото`)
  return parts.join('. ')
}

/** Записка под полароидом, когда пришла карточка снимка: «на фото: кофейня у окна, подруга, какао». */
export function photoCardNote(card: { place?: { ru: string } | null; people?: { role: string }[]; things?: { ru: string }[] } | null | undefined): string {
  if (!card) return ''
  const words: string[] = []
  const add = (w: string | undefined) => {
    const t = (w ?? '').trim()
    if (t && !words.some((x) => x.toLowerCase() === t.toLowerCase())) words.push(t)
  }
  add(card.place?.ru)
  for (const p of card.people ?? []) add(p.role)
  for (const t of card.things ?? []) add(t.ru)
  return words.length ? `на фото: ${words.slice(0, 4).join(', ')}` : ''
}
