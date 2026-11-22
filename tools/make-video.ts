// Видео дня без записи экрана: кадры фильма снимает сама сцена (__dev.filmFrames), ffmpeg склеивает их с песней.
//
//   npx tsx tools/make-video.ts --day 0 --song path/to/song.mp3 --out submission/video/day1.mp4
//
// Параметры:
//   --day N        номер демо-дня (sampleDays в src/timeline/samples), по умолчанию 0
//   --from A --to B  отрезок фильма в секундах (по умолчанию весь фильм: 0 … 61)
//   --fps 24       кадров в секунду
//   --width 1920   ширина кадра (высота 16:9)
//   --photos N     сколько фото у дня (для полароида), по умолчанию 0
//   --song FILE    песня дня; без неё видео немое
//   --url URL      dev-сервер (по умолчанию http://localhost:5183; нужен npm run dev — /__snap есть только там)
//   --out FILE     куда положить mp4
//
// Как работает: запускает Chrome без окна с портом отладки, открывает приложение, вызывает
// __dev.filmFrames(day, [[from, to]], undefined, fps, width, photos) — каждый кадр рисуется
// детерминированно по таймлайну и сохраняется в assets/_raw/snaps/v_0000.png…; затем ffmpeg.
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const arg = (name: string, dflt?: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : dflt
}
const day = Number(arg('day', '0'))
const from = Number(arg('from', '0'))
const to = Number(arg('to', '61'))
const fps = Number(arg('fps', '24'))
const width = Number(arg('width', '1920'))
const photos = Number(arg('photos', '0'))
const song = arg('song')
const url = arg('url', 'http://localhost:5183')!
const out = resolve(arg('out', join(root, `submission/video/day${day + 1}.mp4`))!)
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const snaps = join(root, 'assets/_raw/snaps')

// 1. Чистим старые кадры v_*.png.
mkdirSync(snaps, { recursive: true })
for (const f of readdirSync(snaps)) if (/^v_\d{4}\.png$/.test(f)) rmSync(join(snaps, f))

// 2. Chrome без окна с портом отладки.
const port = 9300 + Math.floor(Math.random() * 500)
const profile = join(root, 'assets/_raw/.chrome-video')
const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--window-size=1920,1080',
  '--autoplay-policy=no-user-gesture-required',
  '--enable-unsafe-swiftshader',
  'about:blank',
], { stdio: 'ignore' })
const stop = () => {
  try {
    chrome.kill()
  } catch {
    /* уже закрыт */
  }
}
process.on('exit', stop)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function cdpTarget(): Promise<string> {
  for (let i = 0; i < 50; i++) {
    try {
      const list = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[]
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      /* Chrome ещё стартует */
    }
    await sleep(200)
  }
  throw new Error('Chrome не ответил на порту отладки')
}

// Минимальный клиент DevTools-протокола на встроенном WebSocket (Node 22+).
const ws = new WebSocket(await cdpTarget())
await new Promise((r, j) => {
  ws.onopen = r
  ws.onerror = j
})
let seq = 0
const pending = new Map<number, (v: { result?: unknown; error?: unknown }) => void>()
ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data)) as { id?: number; result?: unknown; error?: unknown }
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)!(msg)
}
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<{ result?: { result?: { value?: unknown }; exceptionDetails?: unknown }; error?: unknown }>((r) => {
    const id = ++seq
    pending.set(id, r as never)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.error || r.result?.exceptionDetails) throw new Error(JSON.stringify(r.error ?? r.result?.exceptionDetails))
  return r.result?.result?.value
}

// 3. Открыть приложение и дождаться сцены.
await send('Page.enable')
await send('Page.navigate', { url })
for (let i = 0; i < 120; i++) {
  if (await evaluate('!!(window.world && window.__dev && window.__dev.filmFrames)').catch(() => false)) break
  await sleep(250)
}
console.log(`кадры: день ${day + 1}, ${from}–${to} с, ${fps} к/с, ${width}px…`)
const t0 = Date.now()
const n = (await evaluate(`window.__dev.filmFrames(${day}, [[${from}, ${to}]], undefined, ${fps}, ${width}, ${photos})`)) as number
console.log(`снято ${n} кадров за ${Math.round((Date.now() - t0) / 1000)} с`)
ws.close()
stop()

// 4. ffmpeg: кадры + песня → mp4 (H.264, yuv420p — открывается везде).
mkdirSync(dirname(out), { recursive: true })
const ff = ['-y', '-framerate', String(fps), '-i', join(snaps, 'v_%04d.png')]
if (song) {
  if (!existsSync(song)) throw new Error(`нет файла песни ${song}`)
  ff.push('-ss', String(from), '-i', song, '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-af', `afade=t=out:st=${Math.max(0, to - from - 1.5)}:d=1.5`)
}
ff.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', '-movflags', '+faststart', out)
execFileSync('ffmpeg', ff, { stdio: 'inherit' })
console.log(`готово: ${out}`)
