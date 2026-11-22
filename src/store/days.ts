// Хранилище дней в IndexedDB браузера. Демо-дни лежат статикой (см. demo.ts) и сюда не пишутся.
import type { DayScript } from '../types/script'
import type { DirectorSource } from '../director'

export interface StoredSong {
  kind: 'file' | 'link'
  /** аудиофайл (kind = 'file') */
  blob?: Blob
  /** ссылка на песню (kind = 'link') */
  url?: string
  title?: string
  artist?: string
  /** ручки кассетника 0..1 (только для ссылки), если человек их трогал */
  tempo?: number
  energy?: number
  /** измеренный темп файла */
  bpm?: number
  /** песню предложил ИИ по записи и фото (/api/song), человек выбрал её из записки на кассете */
  suggested?: boolean
  /** почему эта песня — одна строка от ИИ (для «Почему так») */
  why?: string
  /** id ролика YouTube: играет встроенный плеер (план 15 § 1.6); из ссылки человека или из предложения ИИ */
  yt?: string
}

export interface StoredDay {
  id: string
  /** YYYY-MM-DD */
  date: string
  text: string
  photos: Blob[]
  /** имена цветов каталога по фото */
  photoPalette?: string[]
  song: StoredSong | null
  script: DayScript
  source: DirectorSource
  seed: number
  createdAt: number
}

const DB = 'memory-book'
const STORE = 'days'
const VERSION = 1

let dbp: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' })
        s.createIndex('createdAt', 'createdAt')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => {
      dbp = null
      reject(req.error)
    }
  })
  return dbp
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        let result: T
        req.onsuccess = () => (result = req.result)
        t.oncomplete = () => resolve(result)
        t.onerror = () => reject(t.error ?? req.error)
        t.onabort = () => reject(t.error ?? new Error('transaction aborted'))
      }),
  )
}

export function newDayId(date = new Date()): string {
  const rnd = Math.random().toString(36).slice(2, 8)
  return `${localDate(date)}-${date.getTime().toString(36)}-${rnd}`
}

export function localDate(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export async function saveDay(day: StoredDay): Promise<void> {
  await tx('readwrite', (s) => s.put(day))
}

export async function getDay(id: string): Promise<StoredDay | undefined> {
  return tx('readonly', (s) => s.get(id) as IDBRequest<StoredDay | undefined>)
}

/** Все дни, старые слева — как на полке. */
export async function listDays(): Promise<StoredDay[]> {
  const all = await tx('readonly', (s) => s.getAll() as IDBRequest<StoredDay[]>)
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function deleteDay(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id))
}

/** Для тестов: закрыть соединение. */
export async function closeDb(): Promise<void> {
  if (!dbp) return
  const db = await dbp.catch(() => null)
  db?.close()
  dbp = null
}
