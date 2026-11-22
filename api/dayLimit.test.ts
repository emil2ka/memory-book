import { beforeEach, describe, expect, it } from 'vitest'
import { overDayLimit, resetDayLimit, whoOf } from './_dayLimit'
import { handleSong } from './song'

const H = 3600_000
describe('лимит дней с ИИ на сервере (7 за скользящую неделю)', () => {
  beforeEach(() => {
    resetDayLimit()
    delete process.env.AI_DAY_LIMIT
  })
  it('семь новых дней — можно, восьмой — нет; сценки и песни того же человека после отказа — тоже нет', () => {
    const t = Date.UTC(2026, 10, 22, 10)
    for (let i = 0; i < 7; i++) expect(overDayLimit('1.2.3.4', 'direct', t + i * H)).toBe(false)
    expect(overDayLimit('1.2.3.4', 'aux', t + 8 * H)).toBe(false)
    expect(overDayLimit('1.2.3.4', 'direct', t + 8 * H)).toBe(true)
    expect(overDayLimit('1.2.3.4', 'aux', t + 9 * H)).toBe(true)
    // другой человек — свой счёт
    expect(overDayLimit('5.6.7.8', 'direct', t)).toBe(false)
  })
  it('окно скользит: через 7 суток после первого дня — снова можно', () => {
    const t = Date.UTC(2026, 10, 22, 10)
    for (let i = 0; i < 7; i++) overDayLimit('9.9.9.9', 'direct', t + i * 24 * H)
    expect(overDayLimit('9.9.9.9', 'direct', t + 6 * 24 * H + H)).toBe(true)
    expect(overDayLimit('9.9.9.9', 'direct', t + 7 * 24 * H + H)).toBe(false)
  })
  it('по id пользователя: тот же человек с другого адреса упирается в тот же лимит', () => {
    const t = Date.UTC(2026, 10, 22, 10)
    for (let i = 0; i < 7; i++) overDayLimit(whoOf(`10.0.0.${i}`, 'user-1'), 'direct', t)
    expect(overDayLimit(whoOf('10.0.0.99', 'user-1'), 'direct', t)).toBe(true)
  })
  it('сверх лимита — 429 day_limit', async () => {
    for (let i = 0; i < 8; i++) overDayLimit('7.7.7.7', 'direct')
    const r = await handleSong({ day: 'Пили какао у окна' }, '7.7.7.7')
    expect(r.status).toBe(429)
    expect(r.json).toMatchObject({ error: 'day_limit' })
  })
})
