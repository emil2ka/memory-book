import { describe, expect, it } from 'vitest'
import { byTakenTime, isHeic, isImageFile, photoCardNote, photoProblem } from './files'

describe('файлы фото', () => {
  it('HEIC узнаём по типу и по расширению (тип часто пустой)', () => {
    expect(isHeic({ name: 'IMG_1.HEIC', type: '' })).toBe(true)
    expect(isHeic({ name: 'a.jpg', type: 'image/heif' })).toBe(true)
    expect(isHeic({ name: 'a.jpg', type: 'image/jpeg' })).toBe(false)
    expect(isImageFile({ name: 'IMG_1.heic', type: '' })).toBe(true)
    expect(isImageFile({ name: 'scan.png', type: '' })).toBe(true)
    expect(isImageFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false)
  })
  it('порядок — по времени снимка, при равенстве как выбрали', () => {
    const f = (n: string, t: number) => ({ name: n, lastModified: t })
    expect(byTakenTime([f('c', 30), f('a', 10), f('b', 10)]).map((x) => x.name)).toEqual(['a', 'b', 'c'])
  })
  it('понятное сообщение', () => {
    expect(photoProblem([], 0)).toBe('')
    expect(photoProblem([{ name: 'x.heic', type: '' }], 0)).toMatch(/HEIC.*JPG/)
    expect(photoProblem([{ name: 'x.jpg', type: 'image/jpeg' }], 2)).toMatch(/не открылось.*не больше 5/)
  })
})

describe('записка «на фото»', () => {
  it('место, люди, вещи — без повторов, не больше четырёх', () => {
    const card = { place: { ru: 'кофейня у окна' }, people: [{ role: 'подруга' }, { role: 'подруга' }], things: [{ ru: 'какао' }, { ru: 'какао' }, { ru: 'дождь за окном' }, { ru: 'телефон' }] }
    expect(photoCardNote(card)).toBe('на фото: кофейня у окна, подруга, какао, дождь за окном')
    expect(photoCardNote(null)).toBe('')
  })
})
