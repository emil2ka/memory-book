// Все пачки по порядку. Новая пачка — новый файл packN.ts и строка здесь.
import { pack1, type Entry } from './pack1'
import { pack2 } from './pack2'
import { pack3 } from './pack3'
import { pack4 } from './pack4'
import { pack5 } from './pack5'
import { pack6 } from './pack6'
import { pack7 } from './pack7'

export type { Entry }
export const packs: Entry[][] = [pack1, pack2, pack3, pack4, pack5, pack6, pack7]
