import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { snapshotPlugin } from './tools/snapshot-plugin'

/**
 * Локальные POST /api/direct, /api/make, /api/scene, /api/photo и /api/song под `npm run dev`: те же обработчики, что на Vercel (api/*.ts).
 * .env читается только на сервере (переменные без префикса VITE_ в клиент не попадают).
 */
function readDotEnv(root: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of ['.env', '.env.local']) {
    try {
      for (const line of readFileSync(join(root, name), 'utf8').split(/\r?\n/)) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
        if (m && m[2]) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
      }
    } catch {
      /* файла нет */
    }
  }
  return out
}

function directorApi(): Plugin {
  return {
    name: 'memory-book:director-api',
    configureServer(server) {
      // .env проекта важнее окружения оболочки (там может быть чужой ключ), поэтому читаем файл сами:
      // loadEnv отдаёт приоритет process.env.
      const env = readDotEnv(server.config.root)
      for (const k of ['ANTHROPIC_API_KEY', 'DIRECTOR_MODEL', 'DIRECTOR_EFFORT', 'DIRECTOR_BASE_URL', 'MAKE_MODEL', 'SCENE_MODEL', 'SCENE_EFFORT', 'AI_DAY_LIMIT']) {
        if (env[k]) process.env[k] = env[k]
      }
      // лимит «3 дня с ИИ в сутки» — для живого сайта; локально (разработка, прогоны) без лимита, если .env не задал свой
      process.env.AI_DAY_LIMIT ||= '1000'
      // одна обвязка на все серверные функции: тело JSON → handler из api/*.ts → ответ
      const routes: Record<string, [string, string]> = {
        '/api/direct': ['/api/direct.ts', 'handleDirect'],
        '/api/make': ['/api/make.ts', 'handleMake'],
        '/api/scene': ['/api/scene.ts', 'handleScene'],
        '/api/photo': ['/api/photo.ts', 'handlePhoto'],
        '/api/song': ['/api/song.ts', 'handleSong'],
      }
      for (const [path, [file, handler]] of Object.entries(routes)) {
        server.middlewares.use(path, async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end('Method Not Allowed')
            return
          }
          const chunks: Buffer[] = []
          let size = 0
          for await (const chunk of req) {
            size += (chunk as Buffer).length
            if (size > 12 * 1024 * 1024) {
              res.statusCode = 413
              res.end('Payload Too Large')
              return
            }
            chunks.push(chunk as Buffer)
          }
          let body: unknown = null
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          } catch {
            body = null
          }
          try {
            const mod = (await server.ssrLoadModule(file)) as Record<string, (b: unknown, ip: string) => Promise<{ status: number; json: unknown; headers: Record<string, string> }>>
            const r = await mod[handler](body, req.socket.remoteAddress ?? 'local')
            res.statusCode = r.status
            for (const [k, v] of Object.entries(r.headers)) res.setHeader(k, v)
            res.end(JSON.stringify(r.json))
          } catch (e) {
            server.config.logger.error(`[${path}] ${e instanceof Error ? e.message : String(e)}`)
            res.statusCode = 500
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify({ error: 'api', message: 'Внутренняя ошибка' }))
          }
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), directorApi(), snapshotPlugin()],
  server: { port: 5183, strictPort: true },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'eval/**/*.test.ts', 'api/**/*.test.ts'] },
} as never)
