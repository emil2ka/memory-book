// Живая проверка /api/song (план 14 § 2): три записи (русская, казахская, русская с фото) → 3 песни на каждую.
//   npx tsx eval/run-song.ts
// Ключ — из .env проекта (важнее окружения оболочки); не печатается. Модель — только claude-haiku-5-5.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runSong, SONG_MODEL } from '../api/song'
import { sanitizePhotoCard } from '../src/kit/scenePhoto'
import type { PhotoCard } from '../src/types/script'

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

const cafe = sanitizePhotoCard({
  caption: 'мы с подругой пьём какао в кофейне',
  place: { ru: 'кофейня у окна', ref: 'cafe_table' },
  things: [{ ru: 'какао', ref: 'cocoa', where: 'table' }],
  people: [{ role: 'подруга', jacket: 'brick', scarf: 'cream', hair: 'brown', accessory: 'none', action: 'drink' }],
  time_of_day: 'evening',
  weather: 'rain',
  palette: ['brown', 'amber'],
  mood: 'уютно',
  match: '',
}) as PhotoCard

const DAYS: { id: string; day: string; cards: PhotoCard[] }[] = [
  { id: 'ru', day: 'Утром проспал и бежал в универ под дождём. На паре было скучно. Вечером поехали к бабушке, она напекла баурсаков, и мы долго пили чай.', cards: [] },
  { id: 'kk', day: 'Бүгін таңертең әжеммен бауырсақ пісірдік. Түстен кейін інім екеуміз аулада доп ойнадық. Кешке бәріміз шай іштік, көңілді болды.', cards: [] },
  { id: 'ru_photo', day: 'После пар встретились с Аминой в кофейне, пили какао у окна, а за стеклом шёл дождь.', cards: [cafe] },
]

console.log(`модель: ${SONG_MODEL}`)
for (const d of DAYS) {
  try {
    const r = await runSong({ day: d.day, cards: d.cards })
    console.log(`\n[${d.id}] ${r.latencyMs} мс — ${r.advice.why}`)
    for (const s of r.advice.songs) console.log(`  ${s.artist} — ${s.title}  (темп ${s.tempo}, энергия ${s.energy}) · ${s.why}`)
  } catch (e) {
    console.log(`\n[${d.id}] ошибка: ${e instanceof Error ? `${(e as { code?: string }).code ?? ''} ${e.message}` : String(e)}`)
  }
}
