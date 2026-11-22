// Снимок страницы приложения в точном размере (Chrome без окна, DevTools-протокол).
// Ждёт шрифты; перед снимком может выполнить JS (--js, можно await) — довести сцену до нужного экрана.
//   npx tsx tools/shot.ts --url "http://localhost:5185/?lab=ui" --w 1672 --h 1180 --out assets/_raw/ui/shots/lab.png
//   --print "window.__m" — вывести значение со страницы после снимка
//   npx tsx tools/shot.ts --url http://localhost:5185/ --w 812 --h 375 --mobile --js "await new Promise(r=>setTimeout(r,9000))" --out x.png
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const args = new Map<string, string>()
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (!a.startsWith('--')) continue
  const next = argv[i + 1]
  if (next === undefined || next.startsWith('--')) args.set(a.slice(2), '1')
  else args.set(a.slice(2), argv[++i])
}
const url = args.get('url') ?? 'http://localhost:5185/'
const w = Number(args.get('w') ?? 1440)
const h = Number(args.get('h') ?? 900)
const out = resolve(args.get('out') ?? 'assets/_raw/ui/shots/shot.png')
const js = args.get('js')
const wait = Number(args.get('wait') ?? 600)
const mobile = args.has('mobile')
const dpr = Number(args.get('dpr') ?? 1)
const root = resolve(dirname(new URL(import.meta.url).pathname), '..')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const port = 9300 + Math.floor(Math.random() * 500)
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${join(root, 'assets/_raw/.chrome-shot')}`, '--hide-scrollbars', '--enable-unsafe-swiftshader', `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' })
const stop = () => {
  try {
    chrome.kill()
  } catch {
    /* уже закрыт */
  }
}
process.on('exit', stop)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

let wsUrl = ''
for (let i = 0; i < 50 && !wsUrl; i++) {
  try {
    const list = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()) as { type: string; webSocketDebuggerUrl: string }[]
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl ?? ''
  } catch {
    /* Chrome ещё стартует */
  }
  if (!wsUrl) await sleep(200)
}
if (!wsUrl) throw new Error('Chrome не ответил на порту отладки')
const ws = new WebSocket(wsUrl)
await new Promise((r, j) => {
  ws.onopen = r
  ws.onerror = j
})
let seq = 0
const pending = new Map<number, (v: { result?: Record<string, unknown>; error?: unknown }) => void>()
ws.onmessage = (ev) => {
  const msg = JSON.parse(String(ev.data)) as { id?: number; result?: Record<string, unknown>; error?: unknown }
  if (msg.id && pending.has(msg.id)) pending.get(msg.id)!(msg)
}
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<{ result?: Record<string, unknown>; error?: unknown }>((r) => {
    const id = ++seq
    pending.set(id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression: string) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  const res = r.result as { result?: { value?: unknown }; exceptionDetails?: unknown } | undefined
  if (r.error || res?.exceptionDetails) throw new Error(JSON.stringify(r.error ?? res?.exceptionDetails))
  return res?.result?.value
}

await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile })
if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
await send('Page.navigate', { url })
for (let i = 0; i < 80; i++) {
  if ((await evaluate('document.readyState').catch(() => '')) === 'complete') break
  await sleep(150)
}
await evaluate('document.fonts.ready.then(() => true)')
if (js) await evaluate(`(async () => { ${js} })()`)
await evaluate('document.fonts.ready.then(() => true)')
await sleep(wait)
const shot = await send('Page.captureScreenshot', { format: 'png' })
// --print: выражение, результат которого вывести (замеры со страницы)
if (args.get('print')) console.log(JSON.stringify(await evaluate(args.get('print')!)))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, Buffer.from(String((shot.result as { data: string }).data), 'base64'))
console.log(`снимок: ${out}`)
ws.close()
stop()
process.exit(0)
