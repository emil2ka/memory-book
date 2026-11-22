import 'fake-indexeddb/auto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { clearDraft, closeDraftDb, DRAFT_FILE_MAX, loadDraft, loadDraftFile, saveDraft, saveDraftFile } from './draft'

beforeAll(() => {
  const mem = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }
})
afterAll(() => closeDraftDb())

describe('черновики записи', () => {
  it('новый день и правка — отдельно; правка помнит id, название и дату дня', () => {
    saveDraft('new', { text: 'Новый день', photos: [], song: { kind: 'link', title: 'Happy', yt: 'ZbZSe6N_BXs' } })
    saveDraft('edit', { text: 'Правка', photos: [], song: null, edit: { id: 'd1', title: 'Первый снег', date: '2026-11-14', createdAt: 1 } })
    expect(loadDraft('new')?.text).toBe('Новый день')
    expect(loadDraft('new')?.song?.yt).toBe('ZbZSe6N_BXs')
    expect(loadDraft('edit')?.edit).toMatchObject({ id: 'd1', title: 'Первый снег', date: '2026-11-14' })
    clearDraft('new')
    expect(loadDraft('new')).toBeNull()
    expect(loadDraft('edit')).not.toBeNull()
  })
  it('файл песни — в IndexedDB; больше 15 МБ — не сохраняется', async () => {
    const small = new File([new Uint8Array(1024)], 'song.mp3', { type: 'audio/mpeg' })
    expect(await saveDraftFile('new', small)).toBe(true)
    const back = await loadDraftFile('new')
    expect(back?.name).toBe('song.mp3')
    expect(back?.size).toBe(1024)
    const big = { name: 'big.wav', type: 'audio/wav', size: DRAFT_FILE_MAX + 1 } as File
    expect(await saveDraftFile('new', big)).toBe(false)
    expect(await loadDraftFile('new')).toBeNull()
  })
})

describe('запись без фильма', () => {
  it('сценарий-заглушка: «… · без фильма», без битов, бледный корешок; день узнаётся и без флага (облако)', async () => {
    const { isNoFilm, noFilmScript } = await import('./days')
    const { spineColor } = await import('../ui/checks')
    const { css, PALETTE } = await import('../scene/palette')
    const s = noFilmScript('Сегодня шёл снег, и я устала. Вечером пили чай.')
    expect(s.title).toBe('Сегодня шёл снег · без фильма')
    expect(s.beats).toHaveLength(0)
    expect(spineColor(s.mood)).toBe(css(PALETTE.greyBlue))
    expect(isNoFilm({ script: s })).toBe(true)
    expect(isNoFilm({ script: { ...s, beats: [{} as never] } })).toBe(false)
  })
})
