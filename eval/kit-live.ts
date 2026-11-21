// Живой прогон режиссёра с библиотекой кита: npx tsx eval/kit-live.ts
// 5 текстов = 5 вызовов claude-haiku-5-5. Печатает, какие kit/make выбрал режиссёр, и план камеры хореографа.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runDirector } from '../api/direct'
import { checkScript } from '../src/director/validate'
import { kitById } from '../src/kit/library'
import { choreograph } from '../src/timeline/choreograph'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (m && m[2]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
} catch { /* нет .env */ }

const samples = [1, 2, 3].map((n) => readFileSync(join(root, 'src/timeline/samples', `day${n}.txt`), 'utf8').trim())
const texts = [
  ...samples,
  'Бабушка подарила мне старую швейную машинку. Весь вечер чинили её с дедушкой, пили чай с баурсаками, а потом я сшила себе сумку из лоскутов. Устала, но горжусь.',
  'Ауылда әжемнің үйінде қымыз іштік. Кешке жылқыларды көрдік, ағам домбыра тартты. Аспанда жұлдыздар көп, тыныш.',
]
const out = []
for (const [i, text] of texts.entries()) {
  const run = await runDirector({ text, photos: [], song: null })
  const errs = checkScript(run.script, text)
  console.log(`\n#${i + 1} «${run.script.title}» ${run.latencyMs} мс, исправлений ${run.issues.length}, ошибок ${errs.length}`)
  for (const b of run.script.beats) {
    const r = b.result
    const label = r.kind === 'kit' ? `kit ${r.id} (${kitById(r.id)?.ru ?? '??'})` : r.kind === 'make' ? `MAKE «${r.name}» — ${r.hint} [${r.tags.join(',')}]` : `${r.kind} ${r.id}`
    console.log(`  «${b.quote}» ${b.action} → ${label}`)
  }
  const tl = choreograph(run.script, { seed: 1, photoCount: 2 })
  const cams = tl.events.filter((e) => e.type === 'camera').map((e) => (e as { shot: string }).shot)
  console.log(`  фильм ${tl.duration} с; камера: ${cams.join(' ')}; полароид: ${tl.events.some((e) => e.type === 'photo_reveal')}`)
  out.push({ text, script: run.script, issues: run.issues, errors: errs, latencyMs: run.latencyMs })
}
writeFileSync(join(here, 'kit-live.json'), JSON.stringify(out, null, 1) + '\n')
