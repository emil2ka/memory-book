// Прогон набора дней (план 13 § 6) через __dev.runDay на frozen-сервере (5185): Chrome без окна, по одному дню
// на свежей странице. Итог — assets/_raw/runs/<prefix>_summary.json и .md (таблица) + папки дней.
//   npx tsx eval/run-days.ts --prefix before            — весь набор
//   npx tsx eval/run-days.ts --prefix after --only etalon,edge_word
//   --offline — без ИИ (запасной режиссёр, сценки из библиотеки), --no-recognize — без теста узнавания
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const argv = process.argv.slice(2)
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const has = (k: string) => argv.includes(`--${k}`)
const prefix = arg('prefix') ?? 'run'
const only = arg('only')?.split(',')
const base = arg('url') ?? 'http://localhost:5185/'
const root = resolve(dirname(new URL(import.meta.url).pathname), '..')

interface Day {
  name: string
  kind: 'etalon' | 'demo' | 'eval' | 'edge'
  text: string
  photos: number
  song: { title?: string; artist?: string; measuredTempoBpm?: number } | null
  /** Настоящие снимки (адреса на dev-сервере) вместо проверочных. */
  photoFiles?: string[]
}

const LONG = `Утро началось с будильника, который я проспал дважды. Мама уже ушла на работу и оставила на столе записку и тарелку сырников. Я съел их стоя, запил холодным чаем и побежал на остановку. Автобус приехал битком, всю дорогу ехал прижатым к окну и смотрел, как город просыпается: дворники метут листья, на углу открывается пекарня, собака тащит хозяина к луже. На паре по истории преподаватель рассказывал про Великий шёлковый путь, и я вдруг представил караван верблюдов, идущий через наш двор. В перерыве с Даниясом ели самсу в столовой и спорили, кто лучше — кошки или собаки, так и не договорились. После обеда была лабораторная по химии: колба зашипела, пошёл синий дым, весь класс захлопал, а лаборантка нахмурилась. Домой шёл пешком через парк. Там на скамейке старик играл на баяне, а рядом голуби дрались за крошки. Купил в киоске мороженое, хотя было прохладно, и съел его, пока смотрел на фонтан, который уже выключили на зиму. Вечером помогал бабушке лепить манты, у меня получались кривые, но она хвалила. Потом позвонила сестра из Астаны, рассказала, что у них уже снег и она слепила снеговика с морковкой вместо носа. Сделал домашку, полчаса играл на гитаре одну и ту же мелодию, пока не получилось без ошибок. Перед сном вышел на балкон: небо чистое, видно три звезды и огни гор. День был длинный и обычный, но почему-то хочется его запомнить.`

const days: Day[] = [
  {
    name: 'etalon',
    kind: 'etalon',
    text: 'Утром проспал и бежал на автобус под дождём, промок насквозь. На паре было скучно, но потом с Айгерим пили какао в кофейне у окна и смеялись. Вечером играл на домбре у бабушки, она испекла баурсаки. Устал, но день был тёплый.',
    photos: 3,
    song: { title: 'тест', measuredTempoBpm: 104 },
  },
  ...[1, 2, 3].map((n): Day => ({ name: `demo_day${n}`, kind: 'demo', text: readFileSync(join(root, `src/timeline/samples/day${n}.txt`), 'utf8').trim(), photos: n === 1 ? 1 : 0, song: null })),
  ...(JSON.parse(readFileSync(join(root, 'eval/stories.json'), 'utf8')) as { id: string; text: string; song: Day['song']; photo?: string }[])
    .filter((s) => !/^d[123]-/.test(s.id))
    .map((s): Day => ({ name: `eval_${s.id.replace(/[^a-z0-9]+/gi, '_')}`, kind: 'eval', text: s.text, photos: s.photo ? 1 : 0, song: s.song })),
  { name: 'edge_word', kind: 'edge', text: 'Устал.', photos: 0, song: null },
  // план 15: сторителлинг без повторов — чувство играет сам человечек
  { name: 'story_bored', kind: 'edge', text: 'Сегодня мне было скучно, потом позвонила подруга и мы пошли гулять. Вечером мы смеялись в кафе, и я устала, но была счастлива.', photos: 0, song: null },
  // роль фото: 3 тестовых снимка (assets/_raw/photos_test — сгенерированы для проверки, в сборку не идут); двор, кофейня, кухня
  {
    name: 'photos_test',
    kind: 'edge',
    text: 'Утром во дворе слепили снеговика с братом. После пар встретились с Айгерим в кофейне, пили какао у окна. Вечером поехали к бабушке, она напекла баурсаков. Устал, но день был тёплый.',
    photos: 3,
    song: { title: 'тест', measuredTempoBpm: 104 },
    photoFiles: ['photo_cafe.jpg', 'photo_kitchen.jpg', 'photo_yard.jpg'].map((f) => `/assets/_raw/photos_test/${f}`),
  },
  { name: 'edge_long', kind: 'edge', text: LONG, photos: 2, song: { title: 'тест', measuredTempoBpm: 140 } },
  { name: 'edge_nobut', kind: 'edge', text: 'Утром сделал зарядку и съел омлет. Поехал на метро в университет. Слушал лекцию про космос. Вечером читал книгу и пил чай с лимоном.', photos: 0, song: { title: 'тест', measuredTempoBpm: 70 } },
]
const list = only ? days.filter((d) => only.includes(d.name)) : days

// ---------- Chrome без окна ----------

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(root, 'assets/_raw/.chrome-run')}`, '--hide-scrollbars', '--enable-unsafe-swiftshader', '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' })
const stop = () => {
  try {
    chrome.kill()
  } catch {
    /* уже закрыт */
  }
}
process.on('exit', stop)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
let wsUrl = ''
for (let i = 0; i < 50 && !wsUrl; i++) {
  try {
    const l = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[]
    wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? ''
  } catch {
    /* стартует */
  }
  if (!wsUrl) await sleep(200)
}
if (!wsUrl) throw new Error('Chrome не ответил')
const ws = new WebSocket(wsUrl)
await new Promise((r, j) => {
  ws.onopen = r
  ws.onerror = j
})
let seq = 0
const waiting = new Map<number, (v: { result?: Record<string, unknown>; error?: unknown }) => void>()
ws.onmessage = (ev) => {
  const m = JSON.parse(String(ev.data)) as { id?: number; result?: Record<string, unknown>; error?: unknown }
  if (m.id && waiting.has(m.id)) waiting.get(m.id)!(m)
}
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<{ result?: Record<string, unknown>; error?: unknown }>((r) => {
    const id = ++seq
    waiting.set(id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  const res = r.result as { result?: { value?: unknown }; exceptionDetails?: { exception?: { description?: string } } } | undefined
  if (r.error || res?.exceptionDetails) throw new Error(res?.exceptionDetails?.exception?.description ?? JSON.stringify(r.error ?? res?.exceptionDetails).slice(0, 400))
  return res?.result?.value
}
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false })

// ---------- прогон ----------

type Summary = Record<string, unknown> & {
  name: string
  recognized?: { prop: number; place: number; placeAsked: number; companion: number; companionAsked: number; built: number; builtAsked: number; of: number }
  recognizedCaption?: { prop: number; place: number; companion: number; of: number }
}
const results: (Summary | { name: string; error: string })[] = []
for (const d of list) {
  const name = `${prefix}_${d.name}`.slice(0, 48)
  process.stdout.write(`${name} … `)
  try {
    await send('Page.navigate', { url: base })
    for (let i = 0; i < 150; i++) {
      await sleep(200)
      if (await evaluate('!!(window.world && window.world.film && window.world.film.person && window.world.film.person.model && window.__dev && window.__dev.runDay)').catch(() => false)) break
    }
    const input = { name, text: d.text, photos: d.photos, ...(d.photoFiles ? { photoFiles: d.photoFiles } : {}), song: d.song, kind: d.kind, offline: has('offline'), recognize: !has('no-recognize'), ...(arg('song') ? { songTest: arg('song') } : {}) }
    const s = (await evaluate(`window.__dev.runDay(${JSON.stringify(input)})`)) as Summary
    results.push(s)
    const r = s.recognized
    console.log(`${s.beats} битов, ${s.duration} с, первое слово ${s.firstWord} с, пустота ${s.maxGap} с, узнано ${r?.prop}/${r?.of}, место ${r?.place}/${r?.placeAsked}, второй ${r?.companion}/${r?.companionAsked}, ошибок ${s.errors}`)
    if (s.songBpm !== undefined) console.log(`  песня ${s.songBpm} bpm: начала битов на долях ${s.startsOnBeat}, концы дорог на долях ${s.travelEndsOnBeat}, поворот ${JSON.stringify(s.turn)}, подъём ${s.rise}, дорога ${s.travelMode}, темп ${s.pace}\n  ${s.songWhy}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    results.push({ name, error: msg })
    console.log(`ОШИБКА ${msg.slice(0, 200)}`)
  }
}
stop()

// ---------- итог ----------

const ok = results.filter((r): r is Summary => !('error' in r))
const sum = (f: (s: Summary) => number) => ok.reduce((n, s) => n + f(s), 0)
const rec = (k: 'prop' | 'place' | 'placeAsked' | 'companion' | 'companionAsked' | 'built' | 'builtAsked' | 'of') => sum((s) => s.recognized?.[k] ?? 0)
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)} %` : '—')
const total = {
  prefix,
  days: results.length,
  failed: results.length - ok.length,
  beats: rec('of'),
  prop: `${rec('prop')}/${rec('of')} (${pct(rec('prop'), rec('of'))})`,
  place: `${rec('place')}/${rec('placeAsked')} (${pct(rec('place'), rec('placeAsked'))})`,
  companion: `${rec('companion')}/${rec('companionAsked')} (${pct(rec('companion'), rec('companionAsked'))})`,
  // узнан ли предмет, который сценка построила на самом деле (отделяет «ИИ взял не то» от «не читается»)
  built: `${rec('built')}/${rec('builtAsked')} (${pct(rec('built'), rec('builtAsked'))})`,
  // с цитатой в кадре (как видит зритель)
  captionProp: `${sum((s) => s.recognizedCaption?.prop ?? 0)}/${sum((s) => s.recognizedCaption?.of ?? 0)} (${pct(sum((s) => s.recognizedCaption?.prop ?? 0), sum((s) => s.recognizedCaption?.of ?? 0))})`,
  captionPlace: `${sum((s) => s.recognizedCaption?.place ?? 0)}/${rec('placeAsked')} (${pct(sum((s) => s.recognizedCaption?.place ?? 0), rec('placeAsked'))})`,
  firstWordMax: Math.max(...ok.map((s) => Number(s.firstWord))),
  maxGap: Math.max(...ok.map((s) => Number(s.maxGap))),
  duration: ok.map((s) => Number(s.duration)),
  sceneSources: { claude: sum((s) => (s.scenes as { claude: number }).claude), cache: sum((s) => (s.scenes as { cache: number }).cache), fallback: sum((s) => (s.scenes as { fallback: number }).fallback), late: sum((s) => (s.scenes as { late: number }).late) },
  models: `${sum((s) => Number(s.models))}/${sum((s) => Number(s.objects))}`,
  directorFallback: ok.filter((s) => s.director !== 'llm').map((s) => s.name),
  errors: sum((s) => Number(s.errors)),
}
const dir = join(root, 'assets/_raw/runs')
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, `${prefix}_summary.json`), JSON.stringify({ total, results }, null, 1))
const rows = results.map((r) =>
  'error' in r
    ? `| ${r.name} | ошибка: ${String(r.error).slice(0, 80)} |||||||||`
    : `| ${r.name} | ${r.beats} | ${r.duration} | ${r.firstWord} | ${r.maxGap} | ${r.recognized?.prop}/${r.recognized?.of} | ${r.recognized?.place}/${r.recognized?.placeAsked} | ${r.recognized?.companion}/${r.recognized?.companionAsked} | ${r.director} ${r.directorMs} мс | ${JSON.stringify(r.scenes)} | ${r.errors} |`,
)
writeFileSync(
  join(dir, `${prefix}_summary.md`),
  [
    `# Прогон «${prefix}»`,
    '',
    `Без подписи — главный предмет узнан: **${total.prop}**; место: **${total.place}**; второй человечек: **${total.companion}**; построенный сценкой предмет: **${total.built}**.`,
    `С цитатой в кадре (как у зрителя) — главный предмет: **${total.captionProp}**; место: **${total.captionPlace}**.`,
    `Первое слово не позже ${total.firstWordMax} с; самая длинная пустота ${total.maxGap.toFixed(2)} с; ошибок консоли ${total.errors}.`,
    '',
    '| день | битов | длина, с | первое слово, с | пустота, с | предмет | место | второй | режиссёр | сценки | ошибки |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n'),
)
console.log(JSON.stringify(total, null, 1))
process.exit(0)
