// Сборка для Vercel через Build Output API (.vercel/output) — без догадок о том, как Vercel компилирует TypeScript:
//   - сайт: vite build → .vercel/output/static;
//   - функции api/direct, api/scene, api/make, api/photo, api/song: esbuild собирает каждую в ОДИН самодостаточный файл (src, assets/*.json,
//     three, @anthropic-ai/sdk внутри) + обёртка Node-обработчика вокруг их POST(Request);
//   - make читает картинки assets/kit2d/*.svg во время работы — они кладутся рядом с функцией.
// Зачем: исходники импортируют модули без расширений и JSON без `with { type: 'json' }` — так умеют Vite и esbuild,
// но не голый Node ESM, а пакет "type": "module".
//   npm run build:vercel            — всё
//   node tools/build-vercel.mjs --skip-site   — только функции (быстро, для проверки)
// Ключ ANTHROPIC_API_KEY — в переменных окружения проекта Vercel (в сборку не попадает).
import { build } from 'esbuild'
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, '.vercel/output')
const skipSite = process.argv.includes('--skip-site')

// Публичный адрес и anon-ключ Supabase (они и так в клиентской сборке) — в функции: сервер проверяет ими токен
// вошедшего (лимит сборок с ИИ, api/_dayLimit.ts). Секретов здесь нет; значения не печатаются.
const envLocal = {}
for (const name of ['.env.local', '.env']) {
  try {
    for (const line of (await import('node:fs')).readFileSync(join(root, name), 'utf8').split(/\r?\n/)) {
      const m = /^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*?)\s*$/.exec(line)
      if (m && m[2] && !envLocal[m[1]]) envLocal[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  } catch {
    /* файла нет */
  }
}

/** Функции и их бюджет (с). */
const FUNCTIONS = { direct: 30, scene: 20, make: 15, photo: 15, song: 15 }

if (!skipSite) {
  rmSync(out, { recursive: true, force: true })
  execSync('npx vite build', { cwd: root, stdio: 'inherit' })
  mkdirSync(join(out, 'static'), { recursive: true })
  cpSync(join(root, 'dist'), join(out, 'static'), { recursive: true })
} else {
  rmSync(join(out, 'functions'), { recursive: true, force: true })
}

// обёртка: Node (req, res) → Web Request → POST модуля → ответ
const wrapper = (name) => `
import * as mod from './api/${name}.ts'
export const config = mod.config
export default async function handler(req, res) {
  try {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const body = Buffer.concat(chunks)
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    const url = 'https://' + (req.headers.host || 'localhost') + (req.url || '/api/${name}')
    const request = new Request(url, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body })
    const response = req.method === 'POST' && typeof mod.POST === 'function' ? await mod.POST(request) : new Response('Method Not Allowed', { status: 405 })
    res.statusCode = response.status
    response.headers.forEach((v, k) => res.setHeader(k, v))
    res.end(Buffer.from(await response.arrayBuffer()))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ error: 'api', message: 'Внутренняя ошибка' }))
  }
}
`

for (const [name, maxDuration] of Object.entries(FUNCTIONS)) {
  const dir = join(out, 'functions/api', `${name}.func`)
  mkdirSync(dir, { recursive: true })
  await build({
    stdin: { contents: wrapper(name), resolveDir: root, sourcefile: `vercel-${name}.mjs`, loader: 'js' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile: join(dir, 'index.mjs'),
    // часть зависимостей (sdk) может звать require — даём его в ESM
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
    legalComments: 'none',
    logLevel: 'warning',
    define: {
      'process.env.BUILD_SUPABASE_URL': JSON.stringify(envLocal.VITE_SUPABASE_URL ?? ''),
      'process.env.BUILD_SUPABASE_ANON_KEY': JSON.stringify(envLocal.VITE_SUPABASE_ANON_KEY ?? ''),
    },
  })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }))
  writeFileSync(join(dir, '.vc-config.json'), JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', maxDuration, shouldAddHelpers: false }, null, 1))
  // make: картинки библиотеки читаются с диска (process.cwd()/assets/kit2d)
  if (name === 'make' && existsSync(join(root, 'assets/kit2d'))) {
    mkdirSync(join(dir, 'assets/kit2d'), { recursive: true })
    for (const f of readdirSync(join(root, 'assets/kit2d'))) if (f.endsWith('.svg')) cpSync(join(root, 'assets/kit2d', f), join(dir, 'assets/kit2d', f))
  }
  console.log(`функция /api/${name} → ${dir}`)
}

// маршруты: файлы сайта как есть, остальное — index.html (одна страница; ?lab=… — параметры)
writeFileSync(
  join(out, 'config.json'),
  JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index.html' }] }, null, 1),
)
console.log('готово: .vercel/output (деплой — только по слову Эмиля: vercel deploy --prebuilt)')
