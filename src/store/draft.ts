// Черновики записи (план 15, «черновик не теряется»): переживают «На полку» и закрытую вкладку.
//   new  — новый день: текст, снимки (data URL), песня;
//   edit — правка сохранённого дня: то же + id, название, дата и время создания правимого дня.
// Текст, снимки и песня-ссылка — в localStorage; файл песни — в IndexedDB (до 15 МБ; больше — черновик без файла,
// при восстановлении записка «файл песни не сохранился — выбери снова»).

export type DraftKind = 'new' | 'edit'

export interface DraftSong {
  kind: 'none' | 'file' | 'link'
  url?: string
  title?: string
  artist?: string
  tempo?: number
  energy?: number
  bpm?: number
  suggested?: boolean
  why?: string
  yt?: string
}

export interface DraftData {
  text: string
  /** снимки — data URL (jpeg, до 768 px) */
  photos: string[]
  song: DraftSong | null
  /** правка сохранённого дня */
  edit?: { id: string; title: string; date: string; createdAt: number }
}

/** Самый большой файл песни, который держим в черновике. */
export const DRAFT_FILE_MAX = 15 * 1024 * 1024
export const SONG_FILE_LOST = 'файл песни не сохранился — выбери снова'

const KEY: Record<DraftKind, string> = { new: 'mb-draft', edit: 'mb-draft-edit' }

export function saveDraft(kind: DraftKind, d: DraftData): void {
  try {
    localStorage.setItem(KEY[kind], JSON.stringify(d))
  } catch {
    // снимки не влезли — хотя бы текст и песня
    try {
      localStorage.setItem(KEY[kind], JSON.stringify({ ...d, photos: [] }))
    } catch {
      /* нет хранилища */
    }
  }
}

export function loadDraft(kind: DraftKind): DraftData | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY[kind]) ?? 'null') as DraftData | null
    if (!raw || typeof raw.text !== 'string') return null
    if (!raw.text.trim() && !raw.photos?.length) return null
    if (kind === 'edit' && !raw.edit?.id) return null
    return { text: raw.text, photos: Array.isArray(raw.photos) ? raw.photos : [], song: raw.song ?? null, ...(raw.edit ? { edit: raw.edit } : {}) }
  } catch {
    return null
  }
}

export function clearDraft(kind: DraftKind): void {
  try {
    localStorage.removeItem(KEY[kind])
  } catch {
    /* нет хранилища */
  }
  void saveDraftFile(kind, null)
}

// ---------- файл песни — IndexedDB ----------

const DB = 'memory-book-draft'
const STORE = 'files'
let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> | null {
  if (typeof indexedDB === 'undefined') return null
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbp
}

/** Сохранить файл песни черновика (null — убрать). false — файл больше DRAFT_FILE_MAX или хранилища нет. */
export async function saveDraftFile(kind: DraftKind, file: File | null): Promise<boolean> {
  const p = db()
  if (!p) return false
  try {
    const d = await p
    const tooBig = !!file && file.size > DRAFT_FILE_MAX
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite')
      if (file && !tooBig) tx.objectStore(STORE).put({ name: file.name, type: file.type, blob: file }, kind)
      else tx.objectStore(STORE).delete(kind)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return !tooBig
  } catch {
    return false
  }
}

/** Файл песни черновика; null — нет. */
export async function loadDraftFile(kind: DraftKind): Promise<File | null> {
  const p = db()
  if (!p) return null
  try {
    const d = await p
    const rec = await new Promise<{ name: string; type: string; blob: Blob } | undefined>((resolve, reject) => {
      const r = d.transaction(STORE).objectStore(STORE).get(kind)
      r.onsuccess = () => resolve(r.result as { name: string; type: string; blob: Blob } | undefined)
      r.onerror = () => reject(r.error)
    })
    return rec ? new File([rec.blob], rec.name, { type: rec.type }) : null
  } catch {
    return null
  }
}

/** Закрыть базу (тесты). */
export async function closeDraftDb(): Promise<void> {
  if (!dbp) return
  try {
    ;(await dbp).close()
  } finally {
    dbp = null
  }
}
