import { describe, expect, it } from 'vitest'
import { CloudError, cloudListDays, cloudReady, currentUser, signIn } from './cloud'

describe('облако без настроек', () => {
  it('без VITE_SUPABASE_URL ничего не делает и не падает', async () => {
    expect(cloudReady).toBe(false)
    expect(currentUser()).toBeNull()
    await expect(signIn('a@b.c', 'secret1')).rejects.toBeInstanceOf(CloudError)
    expect(await cloudListDays()).toEqual([])
  })
})
