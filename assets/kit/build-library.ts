// Собрать библиотеку кита: npx tsx assets/kit/build-library.ts
// Каждый предмет проходит validateKit (тот же, что для дорисовки); ошибка — сборка падает.
// Пишет assets/kit/<категория>.json (массивы KitModel) и assets/kit/packs.json (какие id в какой пачке).
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateKit } from '../../src/kit/validate'
import { CATEGORIES } from '../../src/kit/categories'
import type { KitModel } from '../../src/kit/format'
import { packs } from './src/index'

const here = dirname(fileURLToPath(import.meta.url))
const byCat = new Map<string, KitModel[]>(CATEGORIES.map((c) => [c, []]))
const packIds: Record<string, string[]> = {}
const seen = new Map<string, string>()
const stemOwner = new Map<string, string>()
let failed = 0
let warned = 0

packs.forEach((entries, i) => {
  const name = `pack${i + 1}`
  packIds[name] = []
  for (const { cat, model } of entries) {
    if (!byCat.has(cat)) {
      console.error(`✗ ${model.id}: неизвестная категория ${cat}`)
      failed++
      continue
    }
    const r = validateKit(model)
    if (!r.ok) {
      console.error(`✗ ${model.id}:\n   ${r.errors.join('\n   ')}`)
      failed++
      continue
    }
    const m = { ...r.model!, by: 'library' as const }
    if (seen.has(m.id)) {
      console.error(`✗ ${m.id}: id повторяется (уже в ${seen.get(m.id)})`)
      failed++
      continue
    }
    seen.set(m.id, name)
    for (const s of m.stems) {
      const prev = stemOwner.get(s)
      if (prev) console.warn(`! stem «${s}»: ${prev} и ${m.id}`)
      else stemOwner.set(s, m.id)
    }
    const nonRound = r.warnings.filter((w) => !/поднято|основание/.test(w))
    if (nonRound.length) {
      warned++
      console.warn(`! ${m.id}: ${nonRound.join('; ')}`)
    }
    m.parts.length < 8 && console.warn(`! ${m.id}: всего ${m.parts.length} фигур`)
    byCat.get(cat)!.push(m)
    packIds[name].push(m.id)
  }
})

if (failed) {
  console.error(`\nне прошло: ${failed}`)
  process.exit(1)
}

for (const [cat, list] of byCat) {
  // одна строка на фигуру: читается глазами и не раздувает diff
  const body = list
    .map((m) => {
      const { parts, ...meta } = m
      const head = JSON.stringify(meta).slice(0, -1)
      return `  ${head},"parts":[\n${parts.map((p) => '    ' + JSON.stringify(p)).join(',\n')}\n  ]}`
    })
    .join(',\n')
  writeFileSync(join(here, `${cat}.json`), list.length ? `[\n${body}\n]\n` : '[]\n')
}
writeFileSync(join(here, 'packs.json'), JSON.stringify(packIds, null, 1) + '\n')
const total = [...byCat.values()].reduce((s, l) => s + l.length, 0)
console.log(`готово: ${total} предметов, ${packs.length} пачек; ${[...byCat].map(([c, l]) => `${c} ${l.length}`).join(', ')}${warned ? `; с поправками ${warned}` : ''}`)
