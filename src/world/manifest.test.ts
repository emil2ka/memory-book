import { describe, expect, it } from 'vitest'
import { sampleDays } from '../timeline/samples'
import type { DayScript } from '../types/script'
import { WORLD, chooseItems, dayTags, spineColorName, type ItemDef } from './manifest'

const item = (id: string, tags: string[], slots = ['behind_lamp', 'right_back', 'by_cassette', 'left_front', 'sill_0', 'sill_1']): ItemDef => ({
  id,
  file: `${id}.glb`,
  ru: id,
  slots,
  tags,
  size: [1, 1, 1],
})

const ITEMS: ItemDef[] = [
  item('candle', ['warm', 'night', 'holiday']),
  item('tea_mug', ['warm', 'morning', 'home']),
  item('plant', ['nature', 'calm', 'morning']),
  item('garland', ['holiday', 'night', 'joy']),
  item('notebooks', ['study', 'work']),
  item('glasses', ['study', 'work', 'calm']),
  item('headphones', ['music', 'joy']),
  item('blanket', ['cold', 'warm', 'home', 'snow']),
  item('mittens', ['cold', 'snow', 'kz']),
  item('dombra', ['music', 'kz']),
]

describe('world manifest', () => {
  it('every slot in world.json has a position or a node', () => {
    for (const [id, s] of Object.entries(WORLD.slots)) expect(!!s.at || !!s.node, id).toBe(true)
  })

  it('items in world.json reference known slots and files', () => {
    for (const it of WORLD.items) {
      expect(it.file).toMatch(/\.glb$/)
      for (const s of it.slots) expect(WORLD.slots[s], `${it.id} → ${s}`).toBeTruthy()
    }
  })

  it('day tags come from time, weather, mood and contradiction', () => {
    const d3 = sampleDays[2].script
    const t = dayTags(d3).tags
    expect(t.has('morning')).toBe(true)
    expect(t.has('snow')).toBe(true)
    const d1 = dayTags(sampleDays[0].script)
    expect(d1.sides).not.toBeNull()
    expect(d1.sides![0]).toContain('cold')
    expect(d1.sides![1]).toContain('warm')
  })

  it('chooses 3–5 items, same day → same layout, one item per slot', () => {
    for (const d of sampleDays) {
      const a = chooseItems(d.script, 42, ITEMS)
      const b = chooseItems(d.script, 42, ITEMS)
      expect(a.length).toBeGreaterThanOrEqual(3)
      expect(a.length).toBeLessThanOrEqual(5)
      expect(a.map((p) => p.item.id + '@' + p.slot)).toEqual(b.map((p) => p.item.id + '@' + p.slot))
      expect(new Set(a.map((p) => p.slot)).size).toBe(a.length)
      expect(new Set(a.map((p) => p.item.id)).size).toBe(a.length)
    }
  })

  it('a contradictory day takes items from both sides', () => {
    const d1 = sampleDays[0].script
    for (const seed of [1, 2, 3, 4, 5]) {
      const ids = chooseItems(d1, seed, ITEMS).map((p) => p.item.tags)
      expect(ids.some((t) => t.includes('cold'))).toBe(true)
      expect(ids.some((t) => t.includes('warm'))).toBe(true)
    }
  })

  it('demo days are dressed differently', () => {
    const sets = sampleDays.map((d, i) => chooseItems(d.script, i + 1, ITEMS).map((p) => p.item.id).sort().join(','))
    expect(new Set(sets).size).toBe(3)
  })

  it('items of one group never meet on one day', () => {
    const items = [...ITEMS, { ...item('kese', ['warm', 'morning', 'kz', 'cold']), group: 'drink' }]
    items[1] = { ...items[1], group: 'drink' }
    for (const d of sampleDays)
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const ids = chooseItems(d.script, seed, items).map((p) => p.item.id)
        expect(ids.includes('kese') && ids.includes('tea_mug')).toBe(false)
      }
  })

  it('works with an empty item list', () => {
    expect(chooseItems(sampleDays[0].script as DayScript, 1, [])).toEqual([])
  })

  it('spine colour comes from the day palette, skipping pale colours', () => {
    expect(spineColorName(['white', 'grey_blue', 'slate_blue'], 'x')).toBe('slate_blue')
    expect(spineColorName([], 'abc')).toBe(spineColorName(undefined, 'abc'))
  })
})
