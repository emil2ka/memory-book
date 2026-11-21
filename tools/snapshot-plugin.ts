import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Только для `npm run dev`: POST /__snap?name=kadr.png с PNG в теле сохраняет картинку
 * в assets/_raw/snaps/ (папка не попадает в git). Нужен, чтобы снимать кадры сцены
 * в полном разрешении для проверки и для показа.
 */
export function snapshotPlugin(): Plugin {
  return {
    name: 'memory-book:snapshot',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__snap', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://local')
        const name = url.searchParams.get('name') ?? ''
        if (req.method !== 'POST' || !/^[a-z0-9_-]{1,64}\.png$/i.test(name)) {
          res.statusCode = 400
          res.end('bad request')
          return
        }
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of req) {
          size += (chunk as Buffer).length
          if (size > 30 * 1024 * 1024) {
            res.statusCode = 413
            res.end('too large')
            return
          }
          chunks.push(chunk as Buffer)
        }
        const dir = join(server.config.root, 'assets/_raw/snaps')
        mkdirSync(dir, { recursive: true })
        writeFileSync(join(dir, name), Buffer.concat(chunks))
        res.end('ok')
      })
    },
  }
}
