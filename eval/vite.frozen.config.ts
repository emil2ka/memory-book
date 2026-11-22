// Dev-сервер для сквозной проверки: тот же конфиг, но без слежения за файлами,
// чтобы правки других сессий не перезагружали страницу посреди фильма.
//   npx vite --config eval/vite.frozen.config.ts --port 5185
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import base from '../vite.config'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cfg = base as unknown as Record<string, unknown> & { server?: Record<string, unknown> }
export default { ...cfg, root, server: { ...(cfg.server ?? {}), port: 5185, strictPort: true, hmr: false, watch: { ignored: ['**/*'] } } }
