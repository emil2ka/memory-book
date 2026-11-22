// Демо-дни на полке: пять дней разного настроения (src/timeline/samples), статикой в сборке.
// У каждого — песня из проверенного списка ссылкой YouTube (песня обязательна, план 15): играет встроенный плеер.
import { sampleDays, storyDays } from '../timeline/samples'
import { SONG_LIST } from '../director/songList'
import type { StoredDay, StoredSong } from './days'

export const DEMO_PREFIX = 'demo-'

/** Песня демо-дня: осенний парк — Yellow, ночь перед дедлайном — Don't Stop Me Now, снег — Let It Snow, аул — Атамекен, подруга — Happy. */
const DEMO_SONG: Record<string, string> = { day1: 'yellow', day2: 'dont_stop_me_now', day3: 'let_it_snow', day4: 'atameken', day5: 'happy' }

function demoSong(dayId: string): StoredSong | null {
  const s = SONG_LIST.find((x) => x.id === DEMO_SONG[dayId])
  if (!s?.yt) return null
  return { kind: 'link', url: `https://www.youtube.com/watch?v=${s.yt}`, title: s.title, artist: s.artist, yt: s.yt, tempo: s.tempo, energy: s.energy }
}

const DATES = ['2026-10-18', '2026-11-03', '2026-11-14', '2026-11-16', '2026-11-20']

export const demoDays: StoredDay[] = [...sampleDays, ...storyDays].map((d, i) => ({
  id: `${DEMO_PREFIX}${d.id}`,
  date: DATES[i] ?? '2026-11-01',
  text: d.text.trim(),
  photos: [],
  photoPalette: d.script.palette_hint,
  song: demoSong(d.id),
  script: d.script,
  source: 'llm',
  seed: i + 1,
  createdAt: Date.UTC(2026, 9, 18 + i),
}))

export const isDemo = (id: string) => id.startsWith(DEMO_PREFIX)
