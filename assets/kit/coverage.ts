// Покрытие библиотеки на 50 текстах (13-plan-mechanics § 3.1): npx tsx assets/kit/coverage.ts [-v]
// Тексты: assets/kit/coverage-texts.json (12 из eval/stories.json + 38 реалистичных), у каждого
// размечены главные предметы так, как их выбрал бы режиссёр: «роль:слово».
// Считает:
//   A — доля hero_prop (кроме людей), для которых в библиотеке есть предмет;
//   B — доля, которую поиск библиотеки находит прямо в тексте (findInText), без режиссёра;
//   люди — сколько упоминаний, по ролям (для companions.json).
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findByName, findByWord, findInText, kitById } from '../../src/kit/library'
import { buildDictionary } from './dictionary-build'

const here = dirname(fileURLToPath(import.meta.url))
const stories = JSON.parse(readFileSync(join(here, '../../eval/stories.json'), 'utf8')) as { id: string; lang: string; text: string }[]
const texts = (JSON.parse(readFileSync(join(here, 'coverage-texts.json'), 'utf8')) as { id: string; from?: string; lang?: string; text?: string; props: string[] }[]).map((t) => {
  const s = t.from === 'eval' ? stories.find((x) => x.id === t.id) : undefined
  return { ...t, text: s?.text ?? t.text ?? '', lang: s?.lang ?? t.lang ?? 'ru' }
})
const dict = buildDictionary()

/** Предмет библиотеки для слова режиссёра: сначала словарь, потом поиск библиотеки. */
function resolve(word: string): { id: string | null; via: string } {
  const w = word.toLowerCase().replace(/ё/g, 'е')
  const d = dict.find((e) => e.word.toLowerCase().replace(/ё/g, 'е') === w)
  if (d) return { id: d.lib, via: 'словарь' }
  const m = findByName(word) ?? findByWord(word)
  return { id: m?.id ?? null, via: m ? 'поиск' : 'нет в словаре' }
}

let total = 0
let have = 0
let have3d = 0
let found = 0
let fullTexts = 0
const missing = new Map<string, number>()
const people = new Map<string, number>()
const byRole = new Map<string, [number, number]>()
const rows: string[] = []
const report: unknown[] = []

for (const t of texts) {
  const inText = new Set(findInText(t.text).map((f) => f.id))
  let ok = true
  const line: string[] = []
  const items: unknown[] = []
  for (const p of t.props) {
    const [role, word] = p.split(':')
    if (role === 'person') {
      people.set(word, (people.get(word) ?? 0) + 1)
      continue
    }
    total++
    const { id, via } = resolve(word)
    const r = byRole.get(role) ?? [0, 0]
    r[1]++
    if (id) {
      have++
      r[0]++
      if ((kitById(id)?.parts.length ?? 0) > 0) have3d++
      if (inText.has(id)) found++
    } else {
      ok = false
      missing.set(`${role}:${word}`, (missing.get(`${role}:${word}`) ?? 0) + 1)
    }
    byRole.set(role, r)
    line.push(id ? `${word}→${id}${inText.has(id) ? '' : '*'}` : `✗${word}`)
    items.push({ role, word, lib: id, via, inText: !!id && inText.has(id) })
  }
  if (ok) fullTexts++
  rows.push(`${t.id.padEnd(22)} ${line.join('  ')}`)
  report.push({ id: t.id, lang: t.lang, items })
}

const pct = (a: number, b: number) => `${Math.round((1000 * a) / b) / 10} %`
console.log(`текстов ${texts.length}; hero_prop (без людей) ${total}`)
console.log(`A  есть в библиотеке:        ${have}/${total} = ${pct(have, total)}  (из них с 3D ${have3d})`)
console.log(`B  поиск находит в тексте:   ${found}/${total} = ${pct(found, total)}`)
console.log(`   тексты, где есть всё:     ${fullTexts}/${texts.length}`)
for (const [r, [a, b]] of byRole) console.log(`   ${r.padEnd(8)} ${a}/${b} = ${pct(a, b)}`)
console.log('\nнет в библиотеке (сколько раз):')
for (const [w, n] of [...missing].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${w}`)
console.log('\nлюди (второй человечек):')
console.log('  ' + [...people].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w} ${n}`).join(', '))
if (process.argv.includes('-v')) console.log('\n' + rows.join('\n') + '\n(* — есть в библиотеке, но поиск по тексту не нашёл)')
writeFileSync(join(here, '../_raw/kit_sheets/coverage.json'), JSON.stringify({ total, have, have3d, found, fullTexts, texts: report, missing: Object.fromEntries(missing), people: Object.fromEntries(people) }, null, 1))
