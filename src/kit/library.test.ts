import { describe, expect, it } from 'vitest'
import catalog from '../../assets/catalog.json'
import { KIT_LIMITS } from './format'
import { CATEGORIES, KIT_LIBRARY, KIT_PACKS, categoryOf, findByWord, findInText, kitById, similar } from './library'
import { kitSize, validateKit } from './validate'

/** Семьи цветов палитры: оттенки одной семьи считаются за один цвет предмета. */
const FAMILY: Record<string, string> = {
  ink: 'ink', brownDark: 'brown', brown: 'brown', wood: 'brown', woodLight: 'brown',
  ochre: 'yellow', amber: 'yellow', yellow: 'yellow',
  cream: 'cream', paper: 'cream', paperShade: 'cream', white: 'cream',
  brickDark: 'red', brick: 'red', coral: 'red', peach: 'red',
  greenDark: 'green', green: 'green', greenSoft: 'green', mint: 'green',
  tealDark: 'teal', teal: 'teal',
  navy: 'blue', slateDark: 'blue', slate: 'blue', greyBlue: 'blue', ice: 'blue', frost: 'blue',
  plum: 'purple', mauve: 'purple', grey: 'grey', greyLight: 'grey',
}

describe('библиотека кита', () => {
  it('все предметы проходят validateKit без изменений', () => {
    for (const m of KIT_LIBRARY.filter((x) => x.parts.length)) {
      const r = validateKit(m)
      expect(r.errors, m.id).toEqual([])
      expect(r.model, m.id).toEqual(m)
    }
  })

  it('id уникальны, у каждого категория и пачка', () => {
    const ids = KIT_LIBRARY.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    const inPacks = Object.values(KIT_PACKS).flat()
    expect(new Set(inPacks)).toEqual(new Set(ids))
    for (const id of ids) expect(CATEGORIES).toContain(categoryOf(id))
  })

  it('пачка 1 — все предметы и pop-up каталога с теми же id', () => {
    for (const id of [...Object.keys(catalog.items), ...Object.keys(catalog.popups)]) {
      expect(kitById(id), id).toBeDefined()
      expect(KIT_PACKS.pack1).toContain(id)
    }
    for (const id of Object.keys(catalog.popups)) expect(kitById(id)!.hold, id).toBe('ground')
  })

  it('качество: 8–40 фигур, высота по hold, есть названия', () => {
    for (const m of KIT_LIBRARY.filter((x) => x.parts.length)) {
      expect(m.parts.length, m.id).toBeGreaterThanOrEqual(8)
      expect(m.parts.length, m.id).toBeLessThanOrEqual(40)
      const h = kitSize(m)[1]
      // детали сценок (scene: 'detail') ниже обычного «ground»: 6–20
      const [lo, hi] = m.scene === 'detail' ? KIT_LIMITS.sceneHeight.detail : KIT_LIMITS.height[m.hold]
      expect(h, `${m.id} высота`).toBeGreaterThanOrEqual(lo * 0.85)
      expect(h, `${m.id} высота`).toBeLessThanOrEqual(hi * 1.15)
      const fam = new Set(m.parts.map((p) => FAMILY[p.c]).filter((f) => f !== 'ink'))
      expect(fam.size, `${m.id} семей цветов`).toBeLessThanOrEqual(m.hold === 'ground' ? 7 : 5)
      expect(m.ru.length).toBeGreaterThan(0)
    }
  })

  it('поиск по слову: формы ru/kk/en', () => {
    const cases: [string, string][] = [
      ['какао', 'cocoa'],
      ['кофе', 'coffee'],
      ['капучино', 'coffee'],
      ['кофейне', 'cafe_table'],
      ['Зонтом', 'umbrella'],
      ['снегом', 'snowflake'],
      ['собаку', 'dog'],
      ['котик', 'cat'],
      ['кот', 'cat'],
      ['ит', 'dog'],
      ['мысық', 'cat'],
      ['гитаре', 'guitar'],
      ['ноутбуке', 'laptop'],
      ['автобусе', 'bus'],
      ['шай', 'tea'],
      ['чай.', 'tea'],
      ['coffee', 'coffee'],
    ]
    for (const [w, id] of cases) expect(findByWord(w)?.id, w).toBe(id)
    for (const w of ['который', 'котёл', 'чаще', 'листать', 'ай-ай', 'домофон', 'чайка']) {
      const got = findByWord(w)?.id
      expect(got === undefined || !['cat', 'tea', 'leaf', 'house', 'moon'].includes(got), `${w} → ${got}`).toBe(true)
    }
  })

  it('словарь дневника: формы слов → предмет, частые слова не ловятся', () => {
    const cases: [string, string][] = [
      ['маршрутке', 'bus'],
      ['остановки', 'bus_stop'],
      ['общаге', ''],
      ['шаем', ''],
      ['дастарханом', 'dastarkhan_feast'],
      ['пиалу', 'kese'],
    ]
    for (const [w, id] of cases) if (id) expect(findByWord(w)?.id, w).toBe(id)
    for (const w of ['ели', 'от', 'парень', 'партия', 'голубой', 'торговался', 'жареное', 'месяц', 'семь']) {
      const got = findByWord(w)?.id
      expect(got === undefined || !['fir', 'bonfire', 'campfire', 'school_desk', 'bird', 'shop', 'sun', 'moon', 'shanyrak'].includes(got), `${w} → ${got}`).toBe(true)
    }
    expect(findInText('Бүгін менің туған күнім, жаңбыр жауды').map((f) => f.id)).not.toContain('snowflake')
  })

  it('поиск по тексту находит предметы по порядку', () => {
    const found = findInText('Утром пила какао, потом шла под зонтом к автобусу.')
    expect(found.map((f) => f.id)).toEqual(['cocoa', 'umbrella', 'bus'])
    expect(found[1].word).toBe('зонтом')
  })

  it('похожие по тегам', () => {
    const s = similar(['drink', 'warm'], 6)
    expect(s).toHaveLength(6)
    expect(s.slice(0, 3).map((m) => m.id)).toEqual(expect.arrayContaining(['cocoa', 'tea']))
    expect(similar(['drink'], 3, { exclude: ['cocoa'] }).map((m) => m.id)).not.toContain('cocoa')
  })
})
