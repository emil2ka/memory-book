// Три демо-дня для тест-стенда и сцены: сценарий + точный текст записи.
import type { DayScript } from '../../types/script'
import day1 from './day1.json'
import day2 from './day2.json'
import day3 from './day3.json'
import text1 from './day1.txt?raw'
import text2 from './day2.txt?raw'
import text3 from './day3.txt?raw'

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
