// Dev-плагин прогона дня (план 13 § 6), только для frozen-сервера (eval/vite.frozen.config.ts, порт 5185):
//   POST /__run/save?run=<имя>&file=<файл>  — тело как есть → assets/_raw/runs/<имя>/<файл> (png, jpg, json, txt)
//   POST /__run/recognize  {image, mediaType?, expect}  — тест узнавания кадра (eval/recognize.ts, Haiku)
// Ключ читает directorApi базового конфига из .env; в браузер он не попадает.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) return null
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

const fail = (res: ServerResponse, code: number, msg: string) => {
  res.statusCode = code
  res.end(msg)
}

export function runPlugin(): Plugin {
  return {
    name: 'memory-book:run-day',
    apply: 'serve',
    configureServer(server) {
      // прогон 16–18 дней подряд с одного адреса: лимиты /api/* для сервера оценки выше (на Vercel — свои по умолчанию)
      process.env.DIRECTOR_RATE_LIMIT ??= '500'
      process.env.SCENE_RATE_LIMIT ??= '2000'
      process.env.MAKE_RATE_LIMIT ??= '1000'
      server.middlewares.use('/__run/save', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://local')
        const run = url.searchParams.get('run') ?? ''
        const file = url.searchParams.get('file') ?? ''
        if (req.method !== 'POST' || !/^[a-z0-9_-]{1,48}$/i.test(run) || !/^[a-z0-9_.-]{1,64}\.(png|jpg|json|txt)$/i.test(file) || file.includes('..')) {
          return fail(res, 400, 'bad request')
        }
        const body = await readBody(req, 40 * 1024 * 1024)
        if (!body) return fail(res, 413, 'too large')
        const dir = join(server.config.root, 'assets/_raw/runs', run)
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, file), body)
        res.end('ok')
      })
      server.middlewares.use('/__run/recognize', async (req, res) => {
        if (req.method !== 'POST') return fail(res, 405, 'POST only')
        const body = await readBody(req, 20 * 1024 * 1024)
        if (!body) return fail(res, 413, 'too large')
        try {
          const b = JSON.parse(body.toString('utf8')) as { image: string; full?: string; mediaType?: 'image/png' | 'image/jpeg'; expect: { hero_prop: string; place?: string | null; companion?: { name: string; role: string } | null; built?: string | null } }
          const mod = (await server.ssrLoadModule('/eval/recognize.ts')) as typeof import('./recognize')
          const strip = (x: string) => x.replace(/^data:image\/\w+;base64,/, '')
          // image — без подписи (полоска с цитатой закрашена), full — кадр как у зрителя
          const r = await mod.recognize(strip(b.image), b.expect, b.mediaType ?? 'image/png', b.full ? strip(b.full) : undefined)
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(r))
        } catch (e) {
          server.config.logger.error(`[__run/recognize] ${e instanceof Error ? e.message : String(e)}`)
          res.statusCode = 502
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: e instanceof Error ? e.name : 'error' }))
        }
      })
    },
  }
}
