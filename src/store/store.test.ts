import 'fake-indexeddb/auto'
import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { checkScript } from '../director/validate'
import { extractPalette, dayPalette, nearestCatalogColor } from '../photos/palette'
import { deleteDay, demoDays, exportDayZip, getDay, listDays, saveDay, slugify, type StoredDay } from './index'

const day = (id: string, createdAt: number): StoredDay => ({
  ...demoDays[0],
  id,
  createdAt,
  photos: [new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })],
  song: { kind: 'link', url: 'https://example.com/song', title: 'Песня', tempo: 0.3, energy: 0.6 },
})

describe('store (IndexedDB)', () => {
  it('сохраняет, читает списком по порядку, удаляет', async () => {
    await saveDay(day('b', 2))
    await saveDay(day('a', 1))
    const list = await listDays()
    expect(list.map((d) => d.id)).toEqual(['a', 'b'])
    const got = await getDay('b')
    expect(got?.script.title).toBe(demoDays[0].script.title)
    expect(got?.song?.kind).toBe('link')
    expect(got?.photos).toHaveLength(1)
    await deleteDay('a')
    expect((await listDays()).map((d) => d.id)).toEqual(['b'])
    expect(await getDay('a')).toBeUndefined()
  })
})

describe('demo days', () => {
  it('три валидных демо-дня', () => {
    expect(demoDays).toHaveLength(3)
    for (const d of demoDays) expect(checkScript(d.script, d.text)).toEqual([])
  })
})

describe('zip', () => {
  it('slugify кириллицы и казахского', () => {
    expect(slugify('Осенний парк и какао')).toBe('osenniy-park-i-kakao')
    expect(slugify('Алғашқы қар')).toBe('algashqy-qar')
    expect(slugify('!!!')).toBe('den')
  })

  it('папка дня: entry.json, script.json, photos/, song, cover.png', async () => {
    const d = day('x', 5)
    d.song = { kind: 'file', blob: new Blob([new Uint8Array([9, 9])], { type: 'audio/mpeg' }), title: 'track.mp3', bpm: 120 }
    const cover = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })
    const zip = await exportDayZip(d, cover)
    const files = unzipSync(new Uint8Array(await zip.arrayBuffer()))
    const base = 'days/2026-10-18-osenniy-park-i-kakao'
    expect(Object.keys(files).sort()).toEqual([`${base}/cover.png`, `${base}/entry.json`, `${base}/photos/1.jpg`, `${base}/script.json`, `${base}/song.mp3`].sort())
    const entry = JSON.parse(strFromU8(files[`${base}/entry.json`]))
    expect(entry.text).toBe(d.text)
    expect(entry.song).toMatchObject({ kind: 'file', file: 'song.mp3', bpm: 120 })
    expect(JSON.parse(strFromU8(files[`${base}/script.json`])).title).toBe(d.script.title)
  })
})

describe('photo palette', () => {
  it('находит основные цвета и сводит к каталогу', () => {
    // 70% янтарного, 30% тёмно-синего
    const n = 100
    const data = new Uint8ClampedArray(n * 4)
    for (let i = 0; i < n; i++) {
      const c = i < 70 ? [232, 176, 74] : [24, 34, 58]
      data.set([...c, 255], i * 4)
    }
    const sw = extractPalette(data, 5)
    expect(sw[0].name).toBe('amber')
    expect(sw[0].weight).toBeCloseTo(0.7, 1)
    expect(sw.some((s) => s.name === 'navy')).toBe(true)
    expect(dayPalette([sw])[0]).toBe('amber')
    expect(nearestCatalogColor(250, 250, 245)).toBe('white')
  })

  it('пустое / прозрачное изображение → пусто', () => {
    expect(extractPalette(new Uint8ClampedArray(16))).toEqual([])
  })
})
