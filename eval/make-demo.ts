// Готовые сценарии новых демо-дней (план 15, сдача): режиссёр (Haiku) один раз по своему тексту и песне из списка →
// проверка кодом → src/timeline/samples/dayN.json + dayN.txt. На полке демо-день собирается без ИИ.
//   npx tsx eval/make-demo.ts
// Ключ — из .env проекта (не печатается). Модель — только claude-haiku-5-5.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runDirector } from '../api/direct'
import { validateScript } from '../src/director/validate'
import { SONG_LIST } from '../src/director/songList'
import { songAdaptWhy } from '../src/kit/sceneSong'

for (const name of ['.env', '.env.local']) {
  try {
    for (const line of readFileSync(join(process.cwd(), name), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (m && m[2] && ['ANTHROPIC_API_KEY', 'DIRECTOR_BASE_URL'].includes(m[1])) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch {
    /* файла нет */
  }
}

const DAYS = [
  {
    id: 'day4',
    song: 'atameken',
    text: 'Утром приехали в аул к бабушке. Она напекла баурсаков и поставила самовар. Мы с братом весь день играли в асыки во дворе. Вечером дедушка играл на домбре, а все пели. Мне было так тепло, что не хотелось уезжать.',
  },
  {
    id: 'day5',
    song: 'happy',
    text: 'Сегодня мне было скучно, весь день сидел дома. Потом позвонила подруга, и мы пошли гулять. Ели мороженое в парке и смеялись. Домой вернулся счастливым.',
  },
]

for (const d of DAYS) {
  const s = SONG_LIST.find((x) => x.id === d.song)!
  const song = { title: s.title, artist: s.artist, ...(s.bpm ? { bpm: s.bpm } : {}), energy: s.energy, mood: s.mood }
  const run = await runDirector({ text: d.text, photos: [], song, hero: 'boy' }, { model: 'claude-haiku-5-5' })
  const { script, issues } = validateScript(run.raw, d.text, { hero: 'boy' })
  const line = songAdaptWhy(song)
  if (line) script.why = [script.why[0], script.why[1], line]
  writeFileSync(join(process.cwd(), `src/timeline/samples/${d.id}.json`), JSON.stringify(script, null, 2) + '\n')
  writeFileSync(join(process.cwd(), `src/timeline/samples/${d.id}.txt`), d.text + '\n')
  console.log(`\n${d.id} «${script.title}» — ${run.latencyMs} мс, правок ${issues.length}`)
  for (const b of script.beats) console.log(`  ${b.kind}/${b.emotion ?? '-'}/${b.act ?? '-'} «${b.quote}» → ${b.story}`)
  console.log(`  ${script.why.join(' | ')}`)
}
