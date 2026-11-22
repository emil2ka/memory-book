// Живая проверка плана 15 § 1.1 и 1.5: строки рассказа и длинная запись. Режиссёр (Haiku) → сценарий → хореограф.
//   npx tsx eval/run-story.ts
// Ключ — из .env проекта (не печатается). Модель — только claude-haiku-5-5 (передаётся явно).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runDirector } from '../api/direct'
import { validateScript } from '../src/director/validate'
import { choreograph } from '../src/timeline/choreograph'

for (const name of ['.env', '.env.local']) {
  try {
    for (const line of readFileSync(join(process.cwd(), name), 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
      if (m && m[2] && ['ANTHROPIC_API_KEY', 'DIRECTOR_BASE_URL'].includes(m[1])) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch {
    /* файла нет */
  }
}

const SHORT = 'Утром проспал и бежал в универ под дождём. На паре было скучно. Вечером поехали к бабушке, она напекла баурсаков, и мы долго пили чай.'
const LONG = `Сегодня с самого утра всё пошло не по плану. Будильник не зазвонил, и я проснулся, когда за окном уже было совсем светло. Схватил рюкзак, даже не позавтракал, и побежал на остановку. Автобус ушёл прямо перед носом, так что до универа пришлось идти пешком через парк. Под ногами шуршали жёлтые листья, и было так холодно, что я спрятал руки в карманы.
На первой паре по истории я опоздал на десять минут, преподаватель только посмотрел на меня поверх очков и ничего не сказал. Было скучно, я рисовал в тетради кораблики и смотрел в окно, где ветер гонял листья по двору.
В обед мы с Аминой и Даниялом пошли в столовую. Взяли самсу и горячий чай, сидели у окна и смеялись над тем, как Даниял пытался объяснить, почему он опять не сделал домашку. Амина рассказала, что её младший брат научился кататься на велосипеде, и показала видео на телефоне.
После пар я зашёл в библиотеку за книгой для курсовой. Там было тихо и пахло старой бумагой, я просидел до темноты и прочитал почти половину.
Вечером позвонила мама и сказала, что бабушка ждёт нас на ужин. Мы поехали к ней на такси, город уже светился огнями. Бабушка напекла баурсаков и поставила на стол самовар. Мы долго пили чай с вареньем из смородины, и она рассказывала, как познакомилась с дедушкой на танцах.
Потом мы смотрели старый альбом с фотографиями, и я впервые увидел маму маленькой, с двумя смешными косичками.
Домой вернулись поздно. Когда я выходил из такси, начал падать первый снег. Я постоял немного во дворе, поймал снежинку на ладонь и подумал, что день, который начался так плохо, оказался одним из лучших за эту осень.`

console.log(`длина длинной записи: ${LONG.length} знаков`)
const FEEL = 'Сегодня мне было скучно, потом позвонила подруга и мы пошли гулять.'
const BORED = 'Сегодня мне было скучно, потом позвонила подруга и мы пошли гулять. Вечером мы смеялись в кафе, и я устала, но была счастлива.'
const only = process.argv[2]
for (const [id, text, hero] of ([['feel', FEEL, 'girl'], ['bored', BORED, 'boy'], ['short', SHORT, 'girl'], ['long', LONG, 'boy']] as const).filter((x) => !only || x[0] === only)) {
  try {
    const run = await runDirector({ text, photos: [], song: null, hero }, { model: 'claude-haiku-5-5' })
    const { script, issues } = validateScript(run.raw, text, { hero })
    const rawStories = ((run.raw as { beats?: { story?: string }[] }).beats ?? []).map((b) => b.story)
    console.log(`  герой: ${hero}; заменено строк режиссёра: ${issues.filter((x) => x.startsWith('строка рассказа')).length} из ${rawStories.length}`)
    for (const st of rawStories) console.log(`    режиссёр: ${st}`)
    const tl = choreograph(script, { seed: 1, text, hero })
    const tr = tl.events.filter((e) => e.type === 'travel')
    console.log(`\n[${id}] ${run.model}, ${run.latencyMs} мс, вывод ${run.usage.output} ток.; битов ${script.beats.length}, фильм ${tl.duration} с, дорог ${tr.length}`)
    const rawBeats = ((run.raw as { beats?: { quote?: string }[] }).beats ?? []).map((b) => b.quote)
    console.log(`  «${script.title}»; режиссёр дал ${rawBeats.length}: ${rawBeats.join(' | ')}`)
    console.log(`  правки: ${run.issues.filter((x) => /бит|строк|рассказ/.test(x)).join('; ') || 'нет'}`)
    for (const w of tl.beats) {
      const ev = tl.events.filter((e) => e.beat === w.beat).map((e) => e.type)
      const shown = ev.includes('word_transform') ? `предмет [${w.hero_prop}]` : 'без предмета'
      console.log(`  ${w.start.toFixed(1).padStart(5)} с  ${w.kind}/${w.emotion ?? '-'}/${w.act ?? '-'} ${shown} «${w.quote}» → ${w.story}`)
    }
  } catch (e) {
    console.log(`\n[${id}] ошибка: ${e instanceof Error ? `${(e as { code?: string }).code ?? ''} ${e.message}` : String(e)}`)
  }
}
