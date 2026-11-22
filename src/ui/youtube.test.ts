import { describe, expect, it } from 'vitest'
import { knobBpm, youTubeId } from './youtube'

describe('ссылки YouTube', () => {
  it('id из разных видов ссылок', () => {
    expect(youTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('dQw4w9WgXcQ')
    expect(youTubeId('https://youtu.be/dQw4w9WgXcQ?si=abc')).toBe('dQw4w9WgXcQ')
    expect(youTubeId('https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=x')).toBe('dQw4w9WgXcQ')
    expect(youTubeId('https://m.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(youTubeId('https://open.spotify.com/track/abc')).toBeNull()
    expect(youTubeId('не ссылка')).toBeNull()
    expect(youTubeId(undefined)).toBeNull()
  })
  it('темп ручки → удары в минуту', () => {
    expect(knobBpm(0)).toBe(72)
    expect(knobBpm(1)).toBe(136)
    expect(knobBpm(undefined)).toBe(104)
  })
})
