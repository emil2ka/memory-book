// Пачка предметов через мастера моделей (план 13 ③, § 3.2) — для mb-assets: слово → предмет с проверкой глазами.
//   npx tsx eval/make-batch.ts --name pack_words --words "самокат, настольная лампа, микрофон"
//   npx tsx eval/make-batch.ts --name pack_words --file words.txt      (строка: «слово» или «слово | stand | теги,через,запятую | подсказка»)
//   --role hand|stand (по умолчанию hand), --tags food,warm, --concurrency 3, --looks 4 (заходов с проверкой глазами)
// Принятые предметы → assets/kit/made/<name>.json (массив KitModel, by: "claude"; поле checked — что увидела проверка).
// Рисунки проверки → assets/_raw/make-batch/<name>/<слово>.png и лист <name>/sheet.png. Отклонённые — в <name>.rejected.json
// (с целой моделью последнего захода: model — её можно принять глазами). Места (stand) судятся мягко: «может ли это быть…».
// Модель — только claude-haiku-5-5; ключ из .env (перекрывает окружение оболочки).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(new URL(import.meta.url).pathname), '..')
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && m[2]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
} catch {
  /* нет .env */
}
const { runModel } = await import('../api/_model')
const { makeKey } = await import('../src/kit/library')

const argv = process.argv.slice(2)
const arg = (k: string) => {
  const i = argv.indexOf(`--${k}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const name = (arg('name') ?? 'batch').replace(/[^a-z0-9_-]/gi, '_')
const defRole = (arg('role') === 'stand' ? 'stand' : 'hand') as 'hand' | 'stand'
const defTags = (arg('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean)
const conc = Math.max(1, Math.min(6, Number(arg('concurrency') ?? 3)))

interface Item {
  word: string
  role: 'hand' | 'stand'
  tags: string[]
  hint?: string
}
const items: Item[] = []
const addLine = (line: string) => {
  const [w, r, t, h] = line.split('|').map((s) => s.trim())
  if (!w) return
  items.push({ word: w, role: r === 'stand' ? 'stand' : r === 'hand' ? 'hand' : defRole, tags: t ? t.split(',').map((x) => x.trim()).filter(Boolean) : defTags, hint: h || undefined })
}
if (arg('words')) for (const w of arg('words')!.split(',')) addLine(w)
if (arg('file')) for (const l of readFileSync(resolve(arg('file')!), 'utf8').split(/\r?\n/)) if (l.trim() && !l.startsWith('#')) addLine(l)
if (!items.length) {
  console.log('нет слов: --words "a, b" или --file words.txt')
  process.exit(1)
}

const outDir = join(root, 'assets/_raw/make-batch', name)
mkdirSync(outDir, { recursive: true })
mkdirSync(join(root, 'assets/kit/made'), { recursive: true })

type Row = { word: string; role: string; accepted: boolean; source: string; ms: number; tries: { idea: string; parts: number; seen: string; ok: boolean; errors?: string[] }[]; file?: string; model?: unknown }
const rows: Row[] = []
let next = 0
async function worker() {
  while (next < items.length) {
    const it = items[next++]
    const r = await runModel({ name: it.word, role: it.role, tags: it.tags, hint: it.hint }, { deadlineMs: 60_000, maxLooks: Number(arg('looks') ?? 4) })
    const file = `${makeKey(it.word).replace(/[^a-z0-9_-]/gi, '_') || 'item'}_${rows.length}.png`
    if (r.look) writeFileSync(join(outDir, file), Buffer.from(r.look, 'base64'))
    const last = r.tries[r.tries.length - 1]
    console.log(`${r.accepted ? '✓' : '✗'} ${it.word} (${it.role}): ${r.source}, ${r.tries.length} заход(а), видно «${last?.seen ?? '—'}», ${r.ms} мс`)
    // принятый — его модель; отклонённый — последний рисунок целиком (чтобы принять глазами) и что предложено вместо
    const model = r.accepted ? { ...r.model, ru: it.word, checked: { seen: last?.seen, tries: r.tries.length } } : r.rejected ? { ...r.rejected, ru: it.word, checked: { seen: last?.seen, tries: r.tries.length, accepted: false, instead: r.source === 'library' ? r.model.id : r.source } } : undefined
    rows.push({ word: it.word, role: it.role, accepted: r.accepted, source: r.source, ms: r.ms, tries: r.tries, file: r.look ? file : undefined, model })
  }
}
await Promise.all(Array.from({ length: conc }, worker))

const ok = rows.filter((r) => r.accepted)
writeFileSync(join(root, 'assets/kit/made', `${name}.json`), JSON.stringify(ok.map((r) => r.model), null, 1))
// отклонённые: целый KitModel последнего захода (model) + заходы и что увидела проверка
writeFileSync(join(root, 'assets/kit/made', `${name}.rejected.json`), JSON.stringify(rows.filter((r) => !r.accepted), null, 1))
writeFileSync(join(outDir, 'report.json'), JSON.stringify(rows.map(({ model: _m, ...r }) => r), null, 1))
// лист рисунков проверки (если есть python3 с PIL)
const py = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
rows = json.load(open(sys.argv[1] + '/report.json'))
rows = [r for r in rows if r.get('file')]
if rows:
    W, H, cap, cols = 384, 288, 40, 4
    sheet = Image.new('RGB', (W * cols, (H + cap) * ((len(rows) + cols - 1) // cols)), (27, 20, 16))
    d = ImageDraw.Draw(sheet)
    try: f = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 16)
    except Exception: f = ImageFont.load_default()
    for i, r in enumerate(rows):
        x, y = (i % cols) * W, (i // cols) * (H + cap)
        sheet.paste(Image.open(sys.argv[1] + '/' + r['file']).convert('RGB').resize((W, H)), (x, y))
        seen = r['tries'][-1]['seen'] if r['tries'] else ''
        d.text((x + 6, y + H + 4), ('OK ' if r['accepted'] else 'NO ') + r['word'] + ' -> ' + (seen or '-'), fill=(159, 212, 138) if r['accepted'] else (255, 138, 122), font=f)
    sheet.save(sys.argv[1] + '/sheet.png')
`
spawnSync('python3', ['-c', py, outDir], { stdio: 'inherit' })
console.log(`принято ${ok.length}/${rows.length} → assets/kit/made/${name}.json; лист — assets/_raw/make-batch/${name}/sheet.png`)
process.exit(0)
