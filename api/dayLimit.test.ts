import { beforeEach, describe, expect, it, vi } from 'vitest'
import { overDayLimit, resetDayLimit, verifiedUser, whoOf } from './_dayLimit'
import { handleSong } from './song'

const H = 3600_000
describe('лимит сборок с ИИ на сервере: гость 5, вошедший 20 за скользящую неделю', () => {
  beforeEach(() => {
    resetDayLimit()
    delete process.env.AI_DAY_LIMIT
  })
  it('гость (по IP): 5 можно, 6-я — нет; после отказа сценки и песни — тоже нет', () => {
    const t = Date.UTC(2026, 10, 22, 10)
    for (let i = 0; i < 5; i++) expect(overDayLimit('1.2.3.4', 'direct', t + i * H)).toBe(false)
    expect(overDayLimit('1.2.3.4', 'aux', t + 6 * H)).toBe(false)
    expect(overDayLimit('1.2.3.4', 'direct', t + 6 * H)).toBe(true)
    expect(overDayLimit('1.2.3.4', 'aux', t + 7 * H)).toBe(true)
  })
  it('вошедший (проверенный id): 20 можно, 21-я — нет; окно скользит', () => {
    const t = Date.UTC(2026, 10, 22, 10)
    const who = whoOf('1.2.3.4', 'user-1')
    for (let i = 0; i < 20; i++) expect(overDayLimit(who, 'direct', t + i * 60_000)).toBe(false)
    expect(overDayLimit(who, 'direct', t + H)).toBe(true)
    expect(overDayLimit(who, 'direct', t + 7 * 24 * H + H)).toBe(false)
    // тот же человек с другого адреса — тот же счёт
    expect(whoOf('5.6.7.8', 'user-1')).toBe(who)
  })
  it('токен проверяется на Supabase и кэшируется; плохой или без токена — гость', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ id: 'user-42' }), { status: 200 }))
    const tok = 'Bearer ' + 'a'.repeat(40)
    expect(await verifiedUser(tok, ok as unknown as typeof fetch)).toBe('user-42')
    expect(await verifiedUser(tok, ok as unknown as typeof fetch)).toBe('user-42')
    expect(ok).toHaveBeenCalledTimes(1)
    const bad = vi.fn(async () => new Response('{}', { status: 401 }))
    expect(await verifiedUser('Bearer ' + 'b'.repeat(40), bad as unknown as typeof fetch)).toBeNull()
    expect(await verifiedUser(null, bad as unknown as typeof fetch)).toBeNull()
    expect(await verifiedUser('user-1', bad as unknown as typeof fetch)).toBeNull()
  })
  it('сверх лимита — 429 day_limit, гостю — текст про вход', async () => {
    for (let i = 0; i < 6; i++) overDayLimit('7.7.7.7', 'direct')
    const r = await handleSong({ day: 'Пили какао у окна' }, '7.7.7.7')
    expect(r.status).toBe(429)
    expect(r.json).toMatchObject({ error: 'day_limit', guest: true })
    expect((r.json as { message: string }).message).toMatch(/Войди, и будет 20/)
  })
})
