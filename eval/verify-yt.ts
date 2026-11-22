// План 15 § 1.6: id роликов YouTube для списка песен (src/director/songList.ts). Кандидаты — из поиска (eval/yt-candidates.json),
// здесь каждый проверяется через официальный oEmbed YouTube:
//   200 — ролик есть и его можно встраивать (401 — встраивать нельзя, 404 — нет ролика: такой не берём);
//   название ролика похоже на песню (слова названия), а название или канал — на исполнителя;
//   каверы, караоке, минусы, уроки, ремиксы, slowed/sped up — не берём.
// Из прошедших — канал исполнителя, «official», «VEVO» или «- Topic» важнее; при равенстве — выше в поиске.
// Пишет только проверенные id в src/director/songYt.json; без проверенного id поля нет.
//   npx tsx eval/verify-yt.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SONG_LIST } from '../src/director/songList'

const root = process.cwd()
const candidates = JSON.parse(readFileSync(join(root, 'eval/yt-candidates.json'), 'utf8')) as Record<string, string>

// другие написания (латиница, казахские названия)
const ALIAS: Record<string, { t?: string[]; a?: string[] }> = {
  atameken: { a: ['Хасангалиев', 'Khassangaliyev', 'Hasangaliev', 'Eskendir'] },
  daididau: { t: ['Daididau', 'Дайдидау', 'Daydidau'], a: ['Dimash', 'Димаш', 'Kudaibergen'] },
  kara_zhorga: { t: ['Қара жорға', 'Кара жорга', 'Qara jorga', 'Kara zhorga', 'Kara Zhorga', 'Qara Zhorga'] },
  elim_ai: { t: ['Елім-ай', 'Елим-ай', 'Elim-ai', 'Elim ai', 'Елім ай', 'Елимай'] },
  dudarai: { t: ['Дударай', 'Dudarai', 'Dudaray'] },
  kozimnin_karasy: { t: ['Көзімнің қарасы', 'Козимнин карасы', 'Kozimnin karasy', 'Közimniñ qarası'], a: ['Абай', 'Abai', 'Abay'] },
  aittym_salem: { t: ['Айттым сәлем', 'Айттым салем', 'Aittym salem', 'Қаламқас', 'Каламкас'], a: ['Абай', 'Abai', 'Abay'] },
  adai: { t: ['Адай', 'Adai', 'Aday'], a: ['Құрманғазы', 'Курмангазы', 'Kurmangazy', 'Qurmangazy'] },
  saryarka: { t: ['Сарыарқа', 'Сарыарка', 'Saryarka', 'Saryarqa'], a: ['Құрманғазы', 'Курмангазы', 'Kurmangazy', 'Qurmangazy'] },
  balbyrauyn: { t: ['Балбырауын', 'Balbyrauyn'], a: ['Құрманғазы', 'Курмангазы', 'Kurmangazy', 'Qurmangazy'] },
  aksak_kulan: { t: ['Ақсақ құлан', 'Аксак кулан', 'Aksak kulan', 'Aqsaq qulan'] },
  aiyptama: { t: ['Айыптама', 'Aiyptama', 'Ayiptama', 'Aıyptama'], a: ['Ninety One', '91'] },
  lebedei: { a: ['Dimash', 'Димаш', 'Kudaibergen'] },
  leila: { t: ['Leila', 'Лейла'] },
  nas_ne_dogonyat: { a: ['t.A.T.u', 'tatu', 'Тату'] },
  moi_rok_n_roll: { t: ['Мой рок-н-ролл', 'Мой рок н ролл', 'Moi rock-n-roll'], a: ['Би-2', 'Bi-2', 'Би 2'] },
  polkovniku: { a: ['Би-2', 'Bi-2', 'Би 2'] },
  chto_takoe_osen: { a: ['ДДТ', 'DDT'] },
  hop_hei: { t: ['Хоп хей', 'Hop hey', 'Хоп-хей'] },
  tak_zhe_kak_vse: { a: ["A'Studio", 'A-Studio', 'AStudio', 'А-Студио'] },
  kroshka: { a: ['Руки Вверх', 'Ruki Vverh'] },
  vechnaya_molodost: { a: ['Чиж', 'Chizh'] },
  o_lyubvi: { a: ['Чиж', 'Chizh'] },
  hochu_byt_s_toboi: { a: ['Наутилус', 'Nautilus'] },
  progulki: { a: ['Наутилус', 'Nautilus'] },
  tri_konya: { a: ['Долина', 'Dolina'] },
  novogodnyaya: { a: ['Дискотека Авария', 'Diskoteka Avariya', 'Авария'] },
  uptown_funk: { a: ['Mark Ronson', 'Bruno Mars'] },
  umbrella: { a: ['Rihanna'] },
  three_little_birds: { a: ['Bob Marley'] },
  singin_in_the_rain: { t: ["Singin' in the Rain", 'Singing in the Rain'], a: ['Gene Kelly'] },
  let_it_snow: { t: ['Let It Snow'] },
  winter_vivaldi: { t: ['Winter', 'Зима', "L'inverno", 'Inverno'], a: ['Vivaldi', 'Вивальди'] },
  waltz_flowers: { t: ['Waltz of the Flowers', 'Вальс цветов'], a: ['Tchaikovsky', 'Чайковский'] },
  fur_elise: { t: ['Für Elise', 'Fur Elise', 'К Элизе'], a: ['Beethoven', 'Бетховен'] },
}
const FOLK = /халық|народн/i
const BAD = /cover|кавер|karaoke|караоке|минус|instrumental cover|lesson|урок|разбор|tutorial|на гитаре|guitar chords|аккорды|reaction|реакция|remix|ремикс|slowed|sped up|8d audio|nightcore|bass boosted|1 hour|10 hours|parody|пародия|мультфильм|cartoon|trailer|трейлер/i

const TR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  ә: 'a', ғ: 'g', қ: 'k', ң: 'n', ө: 'o', ұ: 'u', ү: 'u', һ: 'h', і: 'i',
}
// одна «латиница» для сравнения: транслит, без знаков, y/j/i и kh/h, q/k, ts/c — одинаково
const flat = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[а-яёәғқңөұүһі]/g, (c) => TR[c] ?? c)
    .replace(/kh/g, 'h')
    .replace(/ts/g, 'c')
    .replace(/q/g, 'k')
    .replace(/[yj]/g, 'i')
    .replace(/['’`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
const keyWords = (s: string) => {
  const w = flat(s).split(' ').filter(Boolean)
  const long = w.filter((x) => x.length >= 3)
  return long.length ? long : w
}
const hit = (hay: string, needle: string) => {
  const h = ` ${flat(hay)} `
  const ws = keyWords(needle)
  if (!ws.length) return false
  const found = ws.filter((x) => h.includes(` ${x.slice(0, Math.max(3, Math.min(x.length, 5)))}`)).length
  return found / ws.length >= (ws.length <= 2 ? 1 : 0.6)
}

interface OEmbed {
  title: string
  author_name: string
}
async function oembed(v: string): Promise<{ status: number; data?: OEmbed }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v}`)}`)
      if (res.status === 200) return { status: 200, data: (await res.json()) as OEmbed }
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 1500))
        continue
      }
      return { status: res.status }
    } catch {
      await new Promise((r) => setTimeout(r, 1000))
    }
  }
  return { status: 0 }
}

const out: Record<string, string> = {}
const report: string[] = []
const fail: string[] = []
let checked = 0
for (const song of SONG_LIST) {
  const ids = [...new Set((candidates[song.id] ?? '').split(/\s+/).filter((x) => /^[\w-]{11}$/.test(x)))]
  const titles = [song.title, ...(ALIAS[song.id]?.t ?? [])]
  const artists = FOLK.test(song.artist) ? [] : [song.artist, ...(ALIAS[song.id]?.a ?? [])]
  let best: { v: string; score: number; title: string; author: string } | null = null
  const why: string[] = []
  for (const [rank, v] of ids.entries()) {
    const r = await oembed(v)
    checked++
    if (r.status !== 200 || !r.data) {
      why.push(`${v}:${r.status}`)
      continue
    }
    const { title, author_name: author } = r.data
    if (BAD.test(title)) {
      why.push(`${v}:кавер/ремикс`)
      continue
    }
    if (!titles.some((t) => hit(title, t))) {
      why.push(`${v}:название «${title.slice(0, 40)}»`)
      continue
    }
    const artistInTitle = artists.some((a) => hit(title, a))
    const artistInAuthor = artists.some((a) => hit(author, a))
    if (artists.length && !artistInTitle && !artistInAuthor) {
      why.push(`${v}:исполнитель «${author}»`)
      continue
    }
    let score = 10 - rank
    if (artistInAuthor) score += 6
    if (/official|vevo|- topic|официальн/i.test(`${author} ${title}`)) score += 4
    if (/official (music )?video|официальный клип|клип/i.test(title)) score += 2
    if (/live|концерт|выступление/i.test(title)) score -= 3
    // народный күй или песня: запись с домброй или с пометкой «халық» — лучше случайной
    if (FOLK.test(song.artist) && /күй|халық|домбыр|dombyra|dombra|kuy|folk/i.test(`${title} ${author}`)) score += 3
    if (!best || score > best.score) best = { v, score, title, author }
  }
  if (best) {
    out[song.id] = best.v
    report.push(`✓ ${song.id.padEnd(20)} ${best.v}  «${best.title}» — ${best.author}`)
  } else fail.push(`✗ ${song.id.padEnd(20)} ${why.join('; ')}`)
}

writeFileSync(join(root, 'src/director/songYt.json'), JSON.stringify(out, null, 1) + '\n')
console.log(report.join('\n'))
console.log(fail.join('\n'))
console.log(`\nпроверено роликов: ${checked}; песен с id: ${Object.keys(out).length} из ${SONG_LIST.length} → src/director/songYt.json`)
