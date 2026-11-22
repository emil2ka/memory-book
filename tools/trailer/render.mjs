// Кадры фильмов для трейлера: __dev.filmFrames на проверочном сервере (без HMR), каждый отрезок — в свою папку.
// node render.mjs '[["name", dayIndex, from, to], ...]' [width]
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
const clips = JSON.parse(process.argv[2])
const W = Number(process.argv[3] ?? 1920)
const URL = 'http://localhost:5194/'
const SNAPS = '/Users/emil2ka/Desktop/projects/memory-book/assets/_raw/snaps'
const OUT = '/private/tmp/claude-501/-Users-emil2ka-Desktop-projects/51176b8c-8c50-4797-960e-44d37cca81d6/scratchpad/trailer/clips'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const prof = join(OUT, `.prof-${Date.now()}`)
mkdirSync(OUT, { recursive: true })
const port = 9600 + Math.floor(Math.random() * 300)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1920,1080', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stop = () => { try { chrome.kill() } catch {} try { rmSync(prof, { recursive: true, force: true }) } catch {} }
process.on('exit', stop)
let wsUrl = ''
for (let i = 0; i < 60 && !wsUrl; i++) { try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? '' } catch {} if (!wsUrl) await sleep(200) }
const ws = new WebSocket(wsUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0
const pending = new Map()
ws.onmessage = (ev) => { const m = JSON.parse(String(ev.data)); if (m.id && pending.has(m.id)) pending.get(m.id)(m) }
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.error || r.result?.exceptionDetails) throw new Error(JSON.stringify(r.error ?? r.result.exceptionDetails).slice(0, 400)); return r.result?.result?.value }
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
await send('Page.navigate', { url: URL })
for (let i = 0; i < 240; i++) { if (await ev('!!(window.world && window.__dev && window.__dev.filmFrames)').catch(() => false)) break; await sleep(250) }
// демо-дни с рассказом (4 — аул, 5 — скучный день) — в общий список, чтобы filmFrames их видел по номеру
console.log('days:', await ev(`(async () => { const m = await import('/src/timeline/samples/index.ts'); if (m.sampleDays.length < 5) m.sampleDays.push(...m.storyDays); return m.sampleDays.map(d => d.script.title).join(' | ') })()`))
await sleep(3000)
for (const [name, day, a, b] of clips) {
  for (const f of readdirSync(SNAPS)) if (/^v_\d{4}\.png$/.test(f)) rmSync(join(SNAPS, f))
  const t0 = Date.now()
  const n = await ev(`window.__dev.filmFrames(${day}, [[${a}, ${b}]], undefined, 24, ${W}, 0)`)
  const dir = join(OUT, name)
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  for (const f of readdirSync(SNAPS)) if (/^v_\d{4}\.png$/.test(f)) renameSync(join(SNAPS, f), join(dir, f))
  console.log(`${name}: day ${day} ${a}-${b}s → ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}
ws.close(); stop(); process.exit(0)
