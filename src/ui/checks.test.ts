import { describe, expect, it } from 'vitest'
import { MAX_TEXT, missingParts } from './checks'

describe('запись', () => {
  it('до 3000 знаков', () => {
    expect(MAX_TEXT).toBe(3000)
  })
  it('песня не обязательна, если её нет', () => {
    expect(missingParts({ text: 'Утром чай. Вечером дождь.', photos: 1, song: true })).toEqual([])
  })
})
