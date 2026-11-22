// Облако дней (план 15 § 2): Supabase без SDK — прямые запросы к Auth, REST и Storage.
// Работает, только если в сборке есть VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY; иначе cloudReady = false и всё
// остаётся на устройстве, как раньше. Пароль никогда не хранится: в localStorage лежит только сессия (токены).
//
// Схема — supabase/schema.sql: таблица days, ключ (user_id, id); приватное хранилище photos: <user_id>/<day_id>/<i>.jpg;
// RLS — каждый видит только своё. Файл песни в облако не уходит (название, ссылка, yt — да).
// Клиент без @supabase/supabase-js: те же вызовы Auth / REST / Storage, без новой зависимости в сборке.
import type { StoredDay } from './days'

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
// публичные адрес и anon-ключ проекта (их и так видно в сборке сайта; защита данных — RLS, supabase/schema.sql).
// Переменные окружения важнее: так сборка на Vercel из git работает без .env.local.
const PUBLIC_URL = 'https://olrxgoawtalkvjakodad.supabase.co'
const PUBLIC_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9scnhnb2F3dGFsa3ZqYWtvZGFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMzYzNzEsImV4cCI6MjExMDkxMjM3MX0.i0zUjcLRqX_POc1D64Nmz5PdTpn-CjAjV1qJcnTVmZM'
const URL_ = (env.VITE_SUPABASE_URL || PUBLIC_URL).replace(/\/+$/, '')
const KEY = env.VITE_SUPABASE_ANON_KEY || PUBLIC_ANON

/** Облако настроено в этой сборке. */
export const cloudReady = !!(URL_ && KEY)

export interface CloudUser {
  id: string
  email: string
}

interface Session {
  access_token: string
  refresh_token: string
  /** секунды unix */
  expires_at: number
  user: CloudUser
}

const SESSION_KEY = 'mb-cloud-session'
const MODE_KEY = 'mb-cloud-mode'

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}
function writeSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s))
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* приватное окно — сессия живёт до перезагрузки */
  }
}

/** Человек выбрал «без аккаунта» (не показывать первый экран снова). */
export const localOnlyChosen = () => {
  try {
    return localStorage.getItem(MODE_KEY) === 'local'
  } catch {
    return false
  }
}
export const chooseLocalOnly = (on: boolean) => {
  try {
    if (on) localStorage.setItem(MODE_KEY, 'local')
    else localStorage.removeItem(MODE_KEY)
  } catch {
    /* ничего */
  }
}

let session: Session | null = cloudReady ? readSession() : null
const listeners = new Set<(u: CloudUser | null) => void>()
const emit = () => listeners.forEach((f) => f(session?.user ?? null))

export const currentUser = (): CloudUser | null => session?.user ?? null
export function onUserChange(f: (u: CloudUser | null) => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}

/** Понятная ошибка для записки на экране. */
export class CloudError extends Error {}

function authMessage(status: number, body: { msg?: string; error_description?: string; message?: string; error?: string }): string {
  const m = (body.msg || body.error_description || body.message || body.error || '').toLowerCase()
  if (m.includes('invalid login') || m.includes('invalid_grant') || m.includes('invalid credentials')) return 'неверная почта или пароль'
  if (m.includes('already registered') || m.includes('already exists')) return 'такая почта уже есть — войди'
  if (m.includes('password')) return 'пароль слишком короткий: нужно хотя бы 6 знаков'
  if (m.includes('email')) return 'проверь почту'
  if (status === 429) return 'слишком много попыток, подожди минуту'
  return 'не получилось, попробуй ещё раз'
}

async function authCall(path: string, body: unknown): Promise<Session> {
  let res: Response
  try {
    res = await fetch(`${URL_}/auth/v1/${path}`, { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new CloudError('нет сети')
  }
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new CloudError(authMessage(res.status, j))
  // signup без подтверждения почты сразу отдаёт сессию; если подтверждение включено — сессии нет
  if (!j.access_token) throw new CloudError('аккаунт создан — подтверди почту и войди')
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: j.expires_at ?? Math.floor(Date.now() / 1000) + (j.expires_in ?? 3600),
    user: { id: j.user?.id, email: j.user?.email ?? '' },
  }
}

export async function signUp(email: string, password: string): Promise<CloudUser> {
  if (!cloudReady) throw new CloudError('облако не настроено')
  session = await authCall('signup', { email: email.trim(), password })
  writeSession(session)
  chooseLocalOnly(false)
  emit()
  return session.user
}

export async function signIn(email: string, password: string): Promise<CloudUser> {
  if (!cloudReady) throw new CloudError('облако не настроено')
  session = await authCall('token?grant_type=password', { email: email.trim(), password })
  writeSession(session)
  chooseLocalOnly(false)
  emit()
  return session.user
}

export async function signOut(): Promise<void> {
  const s = session
  session = null
  writeSession(null)
  emit()
  if (s && cloudReady) {
    try {
      await fetch(`${URL_}/auth/v1/logout`, { method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${s.access_token}` } })
    } catch {
      /* выход на устройстве уже случился */
    }
  }
}

/** Свежий токен: за минуту до конца — обновить. null — не вошли. */
async function token(): Promise<string | null> {
  if (!session) return null
  if (session.expires_at - 60 > Date.now() / 1000) return session.access_token
  try {
    session = await authCall('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
    writeSession(session)
    return session.access_token
  } catch {
    session = null
    writeSession(null)
    emit()
    return null
  }
}

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  const t = await token()
  if (!t) throw new CloudError('нужно войти')
  const res = await fetch(`${URL_}${path}`, { ...init, headers: { apikey: KEY, authorization: `Bearer ${t}`, ...(init.headers ?? {}) } })
  if (!res.ok) throw new CloudError(`облако ответило ${res.status}`)
  return res
}

interface DayRow {
  user_id: string
  id: string
  date: string
  title: string
  text: string
  script: StoredDay['script']
  /** песня без файла: название, ссылка, yt (свой аудиофайл остаётся на устройстве) */
  song: Omit<NonNullable<StoredDay['song']>, 'blob'> | null
  photo_count: number
  photo_palette: StoredDay['photoPalette'] | null
  source: StoredDay['source']
  seed: number
  created_at: number
}

const BUCKET = 'photos'
const enc = (path: string) => path.split('/').map(encodeURIComponent).join('/')
const photoPath = (uid: string, dayId: string, i: number) => `${uid}/${dayId}/${i}.jpg`
const download = async (path: string): Promise<Blob> => (await api(`/storage/v1/object/authenticated/${BUCKET}/${enc(path)}`)).blob()

/** Сохранить день в облако: снимки, потом строка (upsert по user_id + id). */
export async function cloudSaveDay(day: StoredDay): Promise<void> {
  const u = currentUser()
  if (!u) throw new CloudError('нужно войти')
  for (let i = 0; i < day.photos.length; i++) {
    await api(`/storage/v1/object/${BUCKET}/${enc(photoPath(u.id, day.id, i))}`, {
      method: 'POST',
      headers: { 'content-type': 'image/jpeg', 'x-upsert': 'true' },
      body: day.photos[i],
    })
  }
  let song: DayRow['song'] = null
  if (day.song) {
    const { blob: _b, ...rest } = day.song
    song = rest
  }
  const row: DayRow = {
    user_id: u.id,
    id: day.id,
    date: day.date,
    title: day.script.title,
    text: day.text,
    script: day.script,
    song,
    photo_count: day.photos.length,
    photo_palette: day.photoPalette ?? null,
    source: day.source,
    seed: day.seed,
    created_at: day.createdAt,
  }
  await api('/rest/v1/days?on_conflict=user_id,id', {
    method: 'POST',
    headers: { 'content-type': 'application/json', prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(row),
  })
}

async function fullDay(r: DayRow, uid: string): Promise<StoredDay> {
  const photos: Blob[] = []
  for (let i = 0; i < (r.photo_count ?? 0); i++) {
    try {
      photos.push(await download(photoPath(uid, r.id, i)))
    } catch {
      /* снимок не скачался — день всё равно открывается */
    }
  }
  return { id: r.id, date: r.date, text: r.text, photos, photoPalette: r.photo_palette ?? undefined, song: r.song ? { ...r.song } : null, script: r.script, source: r.source, seed: r.seed, createdAt: r.created_at }
}

/** Все дни из облака со снимками (для полки на новом устройстве). */
export async function cloudListDays(): Promise<StoredDay[]> {
  const u = currentUser()
  if (!u) return []
  const rows = (await (await api('/rest/v1/days?select=*&order=created_at.asc')).json()) as DayRow[]
  const out: StoredDay[] = []
  for (const r of rows) out.push(await fullDay(r, u.id))
  return out
}

export async function cloudGetDay(id: string): Promise<StoredDay | undefined> {
  const u = currentUser()
  if (!u) return undefined
  const rows = (await (await api(`/rest/v1/days?select=*&id=eq.${encodeURIComponent(id)}`)).json()) as DayRow[]
  return rows[0] ? fullDay(rows[0], u.id) : undefined
}

/** id дней, которые уже в облаке (без скачивания снимков). */
export async function cloudDayIds(): Promise<Set<string>> {
  if (!currentUser()) return new Set()
  const rows = (await (await api('/rest/v1/days?select=id')).json()) as { id: string }[]
  return new Set(rows.map((r) => r.id))
}

export async function cloudDeleteDay(id: string): Promise<void> {
  const u = currentUser()
  if (!u) return
  const rows = (await (await api(`/rest/v1/days?select=photo_count&id=eq.${encodeURIComponent(id)}`)).json()) as { photo_count: number }[]
  await api(`/rest/v1/days?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
  const prefixes = Array.from({ length: rows[0]?.photo_count ?? 0 }, (_, i) => photoPath(u.id, id, i))
  if (!prefixes.length) return
  try {
    await api(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prefixes }) })
  } catch {
    /* снимки без строки никому не видны */
  }
}

/** То же, что store/index.ts (saveDay, getDay, listDays, deleteDay), только в облаке. */
export const CloudStore = {
  ready: cloudReady,
  saveDay: cloudSaveDay,
  getDay: cloudGetDay,
  listDays: cloudListDays,
  deleteDay: cloudDeleteDay,
}
