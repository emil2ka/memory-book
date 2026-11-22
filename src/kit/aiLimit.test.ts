import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { aiDaysLeft, aiDraft, aiOff, aiRefused, beginAiDay, resetAiLimit } from './aiLimit'
import { offlineSongAdvice } from './sceneSong'
import { directDay } from '../director'
import { exemplars } from '../director/exemplars'

beforeAll(() => {
  const mem = new Map<string, string>()
  ;(globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) }
})
beforeEach(() => resetAiLimit())

describe('лимит дней с ИИ на клиенте', () => {
  it('7 дней с ИИ за неделю, восьмой — без ИИ; во время седьмого фильма ИИ есть, черновик восьмого — без ИИ', () => {
    expect(aiDaysLeft()).toBe(7)
    for (let i = 0; i < 7; i++) expect(beginAiDay()).toBe(true)
    expect(aiOff()).toBe(false) // седьмой день ещё собирается — сценки с ИИ
    aiDraft()
    expect(aiOff()).toBe(true) // новый черновик: лимит исчерпан
    expect(beginAiDay()).toBe(false)
    expect(aiOff()).toBe(true)
  })
  it('окно скользит: через 7 суток день снова с ИИ', () => {
    const t = Date.UTC(2026, 10, 22, 10)
    for (let i = 0; i < 7; i++) beginAiDay(t + i * 3600_000)
    expect(aiDaysLeft(t + 24 * 3600_000)).toBe(0)
    expect(aiDaysLeft(t + 7 * 24 * 3600_000 + 1)).toBe(1)
  })
  it('сервер сказал day_limit — на этой неделе всё', () => {
    expect(beginAiDay()).toBe(true)
    aiRefused()
    expect(aiDaysLeft()).toBe(0)
    expect(aiOff()).toBe(true)
  })
  it('день без ИИ: запасной режиссёр, без запроса к серверу; песни — из списка без ИИ', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }))
    const r = await directDay({ text: exemplars[0].text, photos: [], song: null }, { offline: true, fetchImpl: f as unknown as typeof fetch })
    expect(r.source).toBe('fallback')
    expect(r.reason).toMatch(/day_limit/)
    expect(f).not.toHaveBeenCalled()
    const a = offlineSongAdvice('Сегодня мне было скучно, потом позвонила подруга и мы пошли гулять')!
    expect(a.songs).toHaveLength(3)
    for (const s of a.songs) expect(s.yt).toMatch(/^[\w-]{11}$/)
    expect(a.why).toMatch(/без ИИ/)
  })
})
