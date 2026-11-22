import { describe, expect, it } from 'vitest'
import { cloudListDays, cloudReady, currentUser } from './cloud'

// Облако настроено по умолчанию: публичный адрес и anon-ключ проекта вшиты (защита — RLS, supabase/schema.sql).
describe('облако без входа', () => {
  it('настроено, но без входа ничего не читает и не падает', async () => {
    expect(cloudReady).toBe(true)
    expect(currentUser()).toBeNull()
    expect(await cloudListDays()).toEqual([])
  })
})
