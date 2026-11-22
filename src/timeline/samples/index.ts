// Демо-дни для полки, тест-стенда и сцены: сценарий + точный текст записи.
// day1–3 — первые демо; day4–5 — сценарии режиссёра под песню (eval/make-demo.ts), рассказ и эмоции.
import type { DayScript } from '../../types/script'
import day1 from './day1.json'
import day2 from './day2.json'
import day3 from './day3.json'
import day4 from './day4.json'
import day5 from './day5.json'
import text1 from './day1.txt?raw'
import text2 from './day2.txt?raw'
import text3 from './day3.txt?raw'
import text4 from './day4.txt?raw'
import text5 from './day5.txt?raw'

export interface SampleDay {
  id: string
  text: string
  script: DayScript
}

export const sampleDays: SampleDay[] = [
  { id: 'day1', text: text1, script: day1 as unknown as DayScript },
  { id: 'day2', text: text2, script: day2 as unknown as DayScript },
  { id: 'day3', text: text3, script: day3 as unknown as DayScript },
]

/** Демо-дни с рассказом и эмоциями (на полке; тесты хореографа держатся первых трёх). */
export const storyDays: SampleDay[] = [
  { id: 'day4', text: text4, script: day4 as unknown as DayScript },
  { id: 'day5', text: text5, script: day5 as unknown as DayScript },
]
