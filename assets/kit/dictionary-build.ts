// Словарь дневника → assets/kit/dictionary.json: npx tsx assets/kit/dictionary-build.ts
// Для каждого слова ищет предмет библиотеки (явный lib, иначе поиск по слову и формам)
// и печатает, чего нет. Покрытие на текстах — assets/kit/coverage.ts.
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KIT_LIBRARY, kitById, makeKey, normWord } from '../../src/kit/library'
import { GROUPS, type Role } from './src/dictionary'

export interface DictEntry {
  word: string
  kk: string
  role: Role
  group: string
  /** основы для поиска: «маршрутк» — начало слова, «кот$» — слово целиком */
  forms: string[]
  /** id предмета библиотеки; null — нет (нужно дорисовать) или не нужен (person) */
  lib: string | null
  /** у предмета есть 3D-фигуры (иначе только картинка) */
  lib3d: boolean
}

const KIT_RULES = KIT_LIBRARY.flatMap((m) => [
  ...m.stems.map((s) => ({ stem: normWord(s.replace(/\$$/, '')), exact: s.endsWith('$'), id: m.id })),
  ...[m.ru, m.kk, m.en].filter(Boolean).map((n) => ({ stem: makeKey(n!), exact: true, id: m.id })),
]).sort((a, b) => b.stem.length - a.stem.length)

/** Предмет кита по слову — без словаря (как library.findByWord до словаря). */
function kitOnly(word: string): string | null {
  const w = makeKey(word)
  if (w.length < 2) return null
  return KIT_RULES.find((r) => (r.exact ? w === r.stem : w.startsWith(r.stem)))?.id ?? null
}

/** «новый_год маршрутк» → [«новый год», «маршрутк»] */
const splitForms = (forms: string) => forms.split(/\s+/).filter(Boolean).map((f) => f.replace(/_/g, ' '))

export function buildDictionary(): DictEntry[] {
  const out: DictEntry[] = []
  for (const [group, rows] of Object.entries(GROUPS)) {
    for (const [word, kk, role, forms, lib] of rows) {
      let id: string | null = null
      if (lib === '-' || lib === '!') id = null
      else if (lib) {
        if (!kitById(lib)) throw new Error(`${word}: нет предмета ${lib} в библиотеке`)
        id = lib
      } else {
        // только по основам и названиям самого кита, не по прошлому словарю (иначе он кормит сам себя)
        const stems = splitForms(forms).map((f) => f.replace(/\$$/, ''))
        id = [word, ...stems].map(kitOnly).find(Boolean) ?? null
      }
      out.push({ word, kk, role, group, forms: splitForms(forms), lib: id, lib3d: !!id && (kitById(id)?.parts.length ?? 0) > 0 })
    }
  }
  return out
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dict = buildDictionary()
  const here = dirname(fileURLToPath(import.meta.url))
  writeFileSync(join(here, 'dictionary.json'), JSON.stringify(dict, null, 1) + '\n')
  const drawable = dict.filter((d) => d.role !== 'person')
  const have = drawable.filter((d) => d.lib)
  console.log(`слов ${dict.length}, из них рисуемых ${drawable.length}; в библиотеке ${have.length} (${Math.round((100 * have.length) / drawable.length)} %), с 3D ${have.filter((d) => d.lib3d).length}`)
  const byRole = new Map<string, [number, number]>()
  for (const d of drawable) {
    const r = byRole.get(d.role) ?? [0, 0]
    r[1]++
    if (d.lib) r[0]++
    byRole.set(d.role, r)
  }
  for (const [r, [a, b]] of byRole) console.log(`  ${r}: ${a}/${b}`)
  console.log('\nнет в библиотеке:')
  for (const d of drawable.filter((x) => !x.lib)) console.log(`  [${d.role}] ${d.word} (${d.group})`)
  if (process.argv.includes('-v')) {
    console.log('\nнайдено поиском:')
    for (const [g, rows] of Object.entries(GROUPS))
      for (const r of rows) if (!r[4]) console.log(`  ${r[0]} → ${dict.find((d) => d.word === r[0] && d.group === g)?.lib}`)
  }
}
