// Все пачки по порядку. Новая пачка — новый файл packN.ts и строка здесь.
import { pack1, type Entry } from './pack1'
import { pack2 } from './pack2'
import { pack3 } from './pack3'
import { pack4 } from './pack4'

export type { Entry }
export const packs: Entry[][] = [pack1, pack2, pack3, pack4]
