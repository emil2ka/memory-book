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
      // приёмник для картинок с чужих сайтов (ChatGPT): картинка приходит в адресе #имя:base64
      server.middlewares.use('/__relay', (_req, res) => {
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.end(`<!doctype html><meta charset=utf-8><body style="background:#111;color:#eee;font:16px monospace"><pre id=o>relay…</pre><script>
(async()=>{const o=document.getElementById('o');try{const h=decodeURIComponent(location.hash.slice(1));const i=h.indexOf(':');
const name=h.slice(0,i);const bin=Uint8Array.from(atob(h.slice(i+1)),c=>c.charCodeAt(0));
const r=await fetch('/__snap?name='+encodeURIComponent(name),{method:'POST',body:bin});o.textContent='saved '+name+' '+(await r.text());document.title='SAVED '+name;history.replaceState(null,'','/__relay')}catch(e){o.textContent='ERR '+e;document.title='ERR'}})();
</script>`)
      })
      server.middlewares.use('/__snap', async (req, res) => {
        const url = new URL(req.url ?? '', 'http://local')
        const name = url.searchParams.get('name') ?? ''
        if (req.method !== 'POST' || !/^[a-z0-9_-]{1,64}\.(png|jpg)$/i.test(name)) {
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
