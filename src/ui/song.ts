// Песня дня в UI: часы фильма от звука, данные ссылки, ручки кассетника.
import type { SongPlayer } from '../audio/SongPlayer'
import type { DayScript, SongInfo, Tempo } from '../types/script'

/**
 * Часы фильма от песни. Если трек кончился раньше фильма, время идёт дальше от системных часов,
 * чтобы фильм не замер.
 */
export function makeSongClock(song: SongPlayer): () => number {
  let endedAt: number | null = null
  let endedT = 0
  return () => {
    const a = song.audio
    if (a.ended || (a.paused && a.currentTime >= song.duration - 0.05 && song.duration > 0)) {
      if (endedAt === null) {
        endedAt = performance.now() / 1000
        endedT = a.currentTime
      }
      return endedT + (performance.now() / 1000 - endedAt)
    }
    endedAt = null
    return a.currentTime
  }
}

/** Плавно приглушить и остановить. */
export function fadeOut(song: SongPlayer, ms = 1200): void {
  const a = song.audio
  const v0 = a.volume
  const t0 = performance.now()
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms)
    a.volume = v0 * (1 - k)
    if (k < 1) requestAnimationFrame(step)
    else {
      a.pause()
      a.volume = v0
    }
  }
  requestAnimationFrame(step)
}

/** Разблокировать звук внутри жеста пользователя (политика автозапуска, особенно Safari). */
export async function unlockSong(song: SongPlayer): Promise<void> {
  const a = song.audio
  const muted = a.muted
  a.muted = true
  try {
    await song.play()
  } catch {
    /* браузер не дал — попробуем ещё раз при старте фильма */
  }
  song.pause()
  song.seek(0)
  a.muted = muted
}

export interface LinkMeta {
  title?: string
  artist?: string
}

/** Название по ссылке через oEmbed (YouTube, Spotify, SoundCloud). Не вышло — пусто, человек впишет сам. */
export async function linkMeta(url: string, timeoutMs = 4000): Promise<LinkMeta> {
  let endpoint: string | null = null
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`
    else if (host === 'open.spotify.com') endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`
    else if (host === 'soundcloud.com') endpoint = `https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`
  } catch {
    return {}
  }
  if (!endpoint) return {}
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetch(endpoint, { signal: ac.signal })
    if (!r.ok) return {}
    const j = (await r.json()) as { title?: string; author_name?: string }
    // «(Official Video) (4K Remaster)», «[Lyrics]» и т.п. — шум, не название
    const title = j.title
      ?.replace(/\s*[([](?:[^)\]]*\b(?:official|video|audio|lyrics?|remaster(?:ed)?|hd|4k|mv|clip|клип|премьера)\b[^)\]]*)[)\]]/gi, '')
      .trim()
    // «Исполнитель - Песня» в названии ролика
    const m = title ? /^(.+?)\s+[-–—]\s+(.+)$/.exec(title) : null
    if (m) return { artist: m[1], title: m[2] }
    return { title, artist: j.author_name?.replace(/\s*-\s*Topic$/, '') }
  } catch {
    return {}
  } finally {
    clearTimeout(timer)
  }
}

export const tempoFromKnob = (k: number): Tempo => (k < 0.34 ? 'slow' : k < 0.67 ? 'medium' : 'fast')
export const knobFromTempo = (t: Tempo): number => (t === 'slow' ? 0.17 : t === 'fast' ? 0.83 : 0.5)

/** Ручки кассетника поверх оценки режиссёра. */
export function applyKnobs(script: DayScript, knobs: { tempo?: number; energy?: number }): DayScript {
  if (knobs.tempo === undefined && knobs.energy === undefined) return script
  const song: SongInfo = {
    ...script.song,
    tempo: knobs.tempo !== undefined ? tempoFromKnob(knobs.tempo) : script.song.tempo,
    energy: knobs.energy !== undefined ? Math.round(knobs.energy * 100) / 100 : script.song.energy,
    estimated: true,
  }
  return { ...script, song }
}
