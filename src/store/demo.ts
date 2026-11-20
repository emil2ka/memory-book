// Демо-дни на полке: три дня из src/timeline/samples, статикой в сборке.
import { sampleDays } from '../timeline/samples'
import type { StoredDay } from './days'

export const DEMO_PREFIX = 'demo-'

export const demoDays: StoredDay[] = sampleDays.map((d, i) => ({
  id: `${DEMO_PREFIX}${d.id}`,
  date: ['2026-10-18', '2026-11-03', '2026-11-14'][i] ?? '2026-11-01',
  text: d.text.trim(),
  photos: [],
  photoPalette: d.script.palette_hint,
  song: null,
  script: d.script,
  source: 'llm',
  seed: i + 1,
  createdAt: Date.UTC(2026, 9, 18 + i),
}))

export const isDemo = (id: string) => id.startsWith(DEMO_PREFIX)
