import { Suspense, lazy, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { World } from './scene/World'
import { PALETTE, css } from './scene/palette'
import { SpriteBank } from './actors/sprites'
import { SongPlayer } from './audio/SongPlayer'
import { directDay } from './director'
import { byTakenTime, dayPalette, photoCardNote, photoFromStored, photoProblem, preparePhoto, type PreparedPhoto } from './photos'
import { deleteDay, demoDays, downloadBlob, exportDayZip, getDay, isDemo, listDays, localDate, newDayId, saveDay, dayFolderName, type StoredDay, type StoredSong } from './store'
import { chooseLocalOnly, cloudDeleteDay, cloudListDays, cloudReady, cloudSaveDay, currentUser, localOnlyChosen, onUserChange, signIn, signOut, signUp, type CloudUser } from './store/cloud'
import { AccountCard, CloudBadge, MovePrompt, Welcome, type SaveState } from './ui/Account'
import { DayPager, DaysBook } from './ui/DayNav'
import { seedFromString } from './timeline/rng'
import type { SongShape } from './timeline/songShape'
import { findListedByYt, findListedSong } from './director/songList'

/** Песня из списка (по ролику или названию): у неё известны темп и «про что» она. */
const listedSong = (s: { yt?: string; title?: string; artist?: string } | null | undefined) =>
  s ? (findListedByYt(s.yt) ?? (s.title ? findListedSong(s.title, s.artist) : null)) : null
/** Темп песни YouTube: известный из списка, иначе по ручке tempo. */
const ytBpm = (s: { yt?: string; title?: string; artist?: string; tempo?: number } | null | undefined) => listedSong(s)?.bpm ?? knobBpm(s?.tempo)
import type { TimelinePlayer } from './timeline/Player'
import type { DayScript, DirectorInput, PhotoCard, SongSuggestion } from './types/script'
import { Bookmark } from './ui/Bookmark'
import { YouTubeSong, knobBpm, youTubeId } from './ui/youtube'
import { photoHash, requestPhotoCard } from './kit/scenePhoto'
import { fetchSongAdvice } from './kit/sceneSong'
import type { SongDraft } from './ui/Cassette'
import { countSentences, missingParts, type Need } from './ui/checks'
import { FlagButton, PinNote, Sheet, SlipButton, TagButton } from './ui/paper'
import { PersonPick, loadPerson, savePerson, type PersonKind } from './ui/PersonPick'
import { HeroPick } from './ui/HeroPick'
import { Shelf } from './ui/Shelf'
import { applyKnobs, fadeOut, linkMeta, makeSongClock, unlockSong } from './ui/song'
import { MAX_PHOTOS, WriteLayer, type PageRects } from './ui/WriteLayer'
import { AI_DAY_NOTE, aiDaysLeft, aiDraft, aiRefused, beginAiDay } from './kit/aiLimit'

type Phase = 'loading' | 'shelf' | 'opening' | 'write' | 'directing' | 'film' | 'after'

interface Current {
  day: StoredDay
  photos: PreparedPhoto[]
  /** уже лежит в хранилище (или демо) */
  stored: boolean
  saved: boolean
  cover?: Blob
}

const EMPTY_SONG: SongDraft = { kind: 'none' }
/** Черновик новой записи в localStorage (текст, снимки, песня-ссылка). */
const DRAFT_KEY = 'mb-draft'
function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* нет хранилища */
  }
}
/** Записка-вопрос посередине экрана (перезаписать день, удалить день). */
const ASK_STYLE: CSSProperties = { position: 'fixed', left: '50%', top: '42%', transform: 'translate(-50%, -50%)', zIndex: 60, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', maxWidth: 'min(86vw, 360px)' }

/** Песня сохранённого дня → черновик кассеты (правка дня). */
function songDraftOf(s: StoredSong | null): SongDraft {
  if (!s) return EMPTY_SONG
  if (s.kind === 'file') return s.blob ? { kind: 'file', file: new File([s.blob], s.title || 'песня'), title: s.title, bpm: s.bpm } : EMPTY_SONG
  return { kind: 'link', url: s.url, title: s.title, artist: s.artist, tempo: s.tempo, energy: s.energy, ...(s.yt ? { yt: s.yt } : {}), ...(s.suggested ? { suggested: true, why: s.why } : {}) }
}

/** Ключ сборки: текст, снимки и песня. Тот же ключ — тот же сценарий без ИИ. */
function buildKey(text: string, photos: readonly PreparedPhoto[], song: SongDraft): string {
  const songId = song.kind === 'file' ? `f:${song.file?.name}:${song.file?.size}` : song.kind === 'link' ? `l:${song.yt ?? song.url ?? ''}:${song.title ?? ''}` : '-'
  return `${text.trim()}|${photos.map((p) => photoHash(p.dataUrl)).join(',')}|${songId}`
}

/** Запись заметно изменилась (для повторного вопроса о песне): разница длины больше четверти и не меньше 40 знаков. */
const textMovedOn = (was: string, now: string) => Math.abs(now.length - was.length) >= Math.max(40, was.length * 0.25)

function isUrl(s?: string) {
  if (!s) return false
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Витрины для проверки: ?lab=kit — все предметы кита. */
const LAB = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lab') : null
const KitLab = lazy(() => import('./lab/KitLab'))
const Kit2DLab = lazy(() => import('./lab/Kit2DLab'))
const LAB_MODE = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('mode') : null
const WorldLab = lazy(() => import('./lab/WorldLab'))
const UiLab = lazy(() => import('./lab/UiLab'))
const PenLab = lazy(() => import('./lab/PenLab'))

export function App() {
  if (LAB === 'world')
    return (
      <Suspense fallback={null}>
        <WorldLab />
      </Suspense>
    )
  if (LAB === 'pen')
    return (
      <Suspense fallback={null}>
        <PenLab />
      </Suspense>
    )
  if (LAB === 'ui')
    return (
      <Suspense fallback={null}>
        <UiLab />
      </Suspense>
    )
  if (LAB === 'kit')
    return (
      <Suspense fallback={null}>
        {LAB_MODE === '3d' ? <KitLab /> : <Kit2DLab />}
      </Suspense>
    )
  return <DiaryApp />
}

function DiaryApp() {
  const host = useRef<HTMLDivElement>(null)
  const worldRef = useRef<World | null>(null)
  const [person, setPersonState] = useState<PersonKind>(loadPerson)
  const personRef = useRef(person)
  const pickPerson = useCallback((kind: PersonKind) => {
    personRef.current = kind
    setPersonState(kind)
    savePerson(kind)
    worldRef.current?.setPerson(kind)
  }, [])
  const songRef = useRef<SongPlayer | null>(null)
  const playerRef = useRef<TimelinePlayer | null>(null)
  const songLoadedFor = useRef<Blob | null>(null)
  /** id дня, который правим после автосохранения (иначе — новый день). */
  const editingId = useRef<string | null>(null)
  /** Черновик записи ещё не собран в фильм (ушли на полку посреди записи). */
  const draftPending = useRef(false)
  /** Правим сохранённый день: его дата и время создания остаются при перезаписи. */
  const editingMeta = useRef<{ date: string; createdAt: number } | null>(null)
  /** При «Собрать» уже спросили «перезаписать этот день?» (ответ: перезаписать или сохранить как новый). */
  const overwriteAsked = useRef(false)
  const [askOverwrite, setAskOverwrite] = useState(false)
  const [askDelete, setAskDelete] = useState(false)
  /** Последний собранный сценарий: тот же текст, фото и песня — без ИИ и без лимита, сценарий тот же. */
  const lastBuilt = useRef<{ key: string; script: DayScript; source: StoredDay['source'] } | null>(null)
  // «записать» на главном экране держится слева от закрытой книги (книга теперь перед человеком, камера двигается)
  const [ctaAt, setCtaAt] = useState<{ right: number; top: number } | null>(null)
  const [ctaReady, setCtaReady] = useState(false)

  const [phase, setPhase] = useState<Phase>('loading')
  const [days, setDays] = useState<StoredDay[]>(demoDays)
  // ---- аккаунт и облако (план 15 § 2): без VITE_SUPABASE_URL ничего этого не видно ----
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(() => currentUser())
  const [welcome, setWelcome] = useState(() => cloudReady && !currentUser() && !localOnlyChosen())
  const [saveState, setSaveState] = useState<SaveState>(() => (currentUser() ? 'cloud' : 'local'))
  const [accountOpen, setAccountOpen] = useState(false)
  const [myDaysOpen, setMyDaysOpen] = useState(false)
  const [cloudIds, setCloudIds] = useState<Set<string>>(new Set())
  const [movePrompt, setMovePrompt] = useState<{ ids: string[]; busy: boolean } | null>(null)
  useEffect(() => onUserChange((u) => setCloudUser(u)), [])
  const [rects, setRects] = useState<PageRects | null>(null)
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<PreparedPhoto[]>([])
  const [photoBusy, setPhotoBusy] = useState(false)
  /** что не так с последними фото (HEIC, не открылось, больше 5) — листок под карточкой фото */
  const [photoNote, setPhotoNote] = useState('')
  /**
   * Карточки снимков (PhotoCard, /api/photo, src/kit/scenePhoto): по хэшу снимка, чтобы поздний ответ
   * после «убрать фото» не лёг на чужой снимок. Нет сети или ключа — карточки нет, всё работает как раньше.
   */
  const [photoCards, setPhotoCards] = useState<Record<string, PhotoCard | null>>({})
  const cardOf = (p: PreparedPhoto) => photoCards[photoHash(p.dataUrl)] ?? null

  const [song, setSong] = useState<SongDraft>(EMPTY_SONG)
  /** записка у сургуча: «на этой неделе уже 7 дней с ИИ — этот соберу сам» (лимит дней с ИИ, src/kit/aiLimit) */
  const [aiNote, setAiNote] = useState(() => (aiDaysLeft() > 0 ? '' : AI_DAY_NOTE))

  // Esc закрывает записки-вопросы и «Мои дни»
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setAskOverwrite(false)
      setAskDelete(false)
      setMyDaysOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Черновик не теряется: текст, снимки и песня-ссылка новой записи лежат в localStorage — переживают «На полку»
  // и закрытую вкладку; при следующем «Записать день» запись продолжается («Дописать день»).
  useEffect(() => {
    if (phase !== 'write' || editingId.current) return
    const t = setTimeout(() => {
      if (!text.trim() && !photos.length) return void clearDraft()
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, photos: photos.map((p) => p.dataUrl), song: song.kind === 'link' ? { ...song } : null }))
      } catch {
        // снимки не влезли — хотя бы текст
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, photos: [], song: song.kind === 'link' ? { ...song } : null }))
        } catch {
          /* нет хранилища */
        }
      }
    }, 600)
    return () => clearTimeout(t)
  }, [phase, text, photos, song])
  useEffect(() => {
    let raw: { text?: string; photos?: string[]; song?: SongDraft | null } | null = null
    try {
      raw = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null')
    } catch {
      raw = null
    }
    if (!raw || (!raw.text?.trim() && !raw.photos?.length)) return
    const r = raw
    void (async () => {
      const restored: PreparedPhoto[] = []
      for (const url of r.photos ?? []) {
        try {
          restored.push(await photoFromStored(await (await fetch(url)).blob()))
        } catch {
          /* битый снимок — без него */
        }
      }
      setText((t) => t || r.text || '')
      setPhotos((ps) => (ps.length ? ps : restored))
      if (r.song?.kind === 'link') setSong((cur) => (cur.kind === 'none' ? (r.song as SongDraft) : cur))
      draftPending.current = true
    })()
  }, [])
  const [need, setNeed] = useState<Need[]>([])
  /** записка «ты не поставил песню» на кассете (план 14 § 2): песни от ИИ по записи и фото; null — записки нет */
  const [songAdvice, setSongAdvice] = useState<{ state: 'loading' | 'ready'; songs: SongSuggestion[]; why?: string; withPhotos?: boolean } | null>(null)
  /** по чему уже спрашивали песню: повторно — если запись заметно изменилась или сменился набор карточек фото */
  const adviceFor = useRef<{ text: string; cards: string } | null>(null)
  /** какие снимки уже с карточками: добавили или убрали фото, пришла карточка — песни подбираются заново */
  const cardsKey = photos.map((p) => (photoCards[photoHash(p.dataUrl)] ? photoHash(p.dataUrl) : '')).filter(Boolean).join(',')

  // Запись написана (пауза 2.5 с), а песни нет — ИИ предлагает три песни. Без сети записки нет, ничего не блокирует.
  useEffect(() => {
    if (phase !== 'write' || song.kind !== 'none') return
    const t = text.trim()
    if (t.length < 30 || countSentences(t) < 1) return
    const asked = adviceFor.current
    if (asked !== null && !textMovedOn(asked.text, t) && asked.cards === cardsKey) return
    const timer = setTimeout(() => {
      const ask = { text: asked && !textMovedOn(asked.text, t) ? asked.text : t, cards: cardsKey }
      adviceFor.current = ask
      // старая записка остаётся, пока подбирается новая
      setSongAdvice((cur) => (cur?.state === 'ready' ? cur : { state: 'loading', songs: [] }))
      const cards = photos.map(cardOf)
      void fetchSongAdvice(t, cards).then((a) => {
        if (adviceFor.current !== ask) return
        setSongAdvice((cur) => (a && a.songs.length ? { state: 'ready', songs: a.songs, why: a.why, withPhotos: cards.some(Boolean) } : cur?.state === 'ready' ? cur : null))
      })
    }, 2500)
    return () => clearTimeout(timer)
    // карточки фото учитываются, если уже пришли; ждать их не нужно
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, text, song.kind, cardsKey])

  // ссылка YouTube (своя или из записки ИИ): ролик готовим заранее, чтобы в клике «Собрать» успеть его разблокировать
  const draftYt = song.kind === 'link' ? song.yt ?? youTubeId(song.url) : null
  useEffect(() => {
    if (phase === 'write' && draftYt) void getYt().load(draftYt, knobBpm(song.tempo)).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, draftYt])
  const [current, setCurrent] = useState<Current | null>(null)
  const [status, setStatus] = useState<string>('')
  /** В сцене идёт фильм (в том числе запущенный в обход App, например из консоли). */
  const [sceneFilm, setSceneFilm] = useState(false)

  const getSong = () => (songRef.current ??= new SongPlayer())
  /** песня по ссылке YouTube (своя или предложенная ИИ) — встроенный плеер, src/ui/youtube.ts */
  const ytRef = useRef<YouTubeSong | null>(null)
  const getYt = () => (ytRef.current ??= new YouTubeSong())
  /** играет ли сейчас фильм под YouTube (для паузы пробелом) */
  const ytOn = useRef(false)

  // Пока режиссёр думает (5–10 с), показываем, что именно сейчас происходит, а не одно «собираю…».
  const [busyStep, setBusyStep] = useState(0)
  useEffect(() => {
    if (phase !== 'directing') return
    setBusyStep(0)
    const id = window.setInterval(() => setBusyStep((s) => s + 1), 1700)
    return () => window.clearInterval(id)
  }, [phase])
  const busySteps = [
    'читаю запись…',
    ...(photos.length ? ['смотрю фото…'] : []),
    ...(song.kind !== 'none' ? ['слушаю песню…'] : []),
    'выбираю слова…',
    'ставлю свет…',
    'почти готово…',
  ]
  const busyText = aiNote || busySteps[Math.min(busyStep, busySteps.length - 1)]

  // Узкий портретный экран: кадр сцены 16:9, книга мелкая — советуем повернуть телефон.
  const [portrait, setPortrait] = useState(() => typeof innerWidth === 'number' && innerWidth < 600 && innerHeight > innerWidth)
  const [rotateDismissed, setRotateDismissed] = useState(false)
  useEffect(() => {
    const on = () => setPortrait(innerWidth < 600 && innerHeight > innerWidth)
    addEventListener('resize', on)
    return () => removeEventListener('resize', on)
  }, [])

  // Клик или тап по книге на 3D-полке открывает день (сцена отвечает только на экране полки).
  const openDayRef = useRef<(d: StoredDay) => void>(() => {})
  const newDayRef = useRef<() => void>(() => {})
  const daysRef = useRef(days)
  daysRef.current = days
  useEffect(() => {
    const w = worldRef.current
    if (!w || phase === 'loading') return
    const offShelf = w.onShelfPick((id) => {
      const d = daysRef.current.find((x) => x.id === id)
      if (d) openDayRef.current(d)
    })
    // клик по закрытой книге на столе — записать день
    const offBook = w.onBookPick(() => newDayRef.current())
    return () => {
      offShelf()
      offBook()
    }
  }, [phase === 'loading'])

  // Полка-архив в 3D-мире: старые дни первыми; играющий новый день стоит на полке сразу,
  // даже до сохранения — иначе его книге в финале некуда въехать.
  useEffect(() => {
    const w = worldRef.current
    if (!w || phase === 'loading') return
    const list = [...days]
    if (current && !list.some((d) => d.id === current.day.id)) list.push(current.day)
    list.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    w.setShelf(list.map((d) => ({ id: d.id, title: d.script.title, paletteHint: d.script.palette_hint })))
  }, [days, current, phase])

  // Книга ещё открывается, а человек уже пишет: копим нажатия, чтобы первые слова не пропали.
  useEffect(() => {
    if (phase !== 'write' || rects) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.length === 1) setText((t) => t + e.key)
      else if (e.key === 'Backspace') setText((t) => t.slice(0, -1))
      else if (e.key === 'Enter') setText((t) => t + '\n')
      else return
      e.preventDefault()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [phase, rects])

  // Цвета интерфейса — только из мастер-палитры сцены.
  useEffect(() => {
    const root = document.documentElement
    for (const [k, v] of Object.entries(PALETTE)) root.style.setProperty(`--${k}`, css(v))
  }, [])

  /** Сохранить день: всегда на устройстве; вошли — ещё и в облако (значок сверху говорит, где он). */
  const persistDay = async (day: StoredDay) => {
    await saveDay(day)
    if (!currentUser()) {
      setSaveState('local')
      return
    }
    setSaveState('saving')
    try {
      await cloudSaveDay(day)
      setCloudIds((ids) => new Set(ids).add(day.id))
      setSaveState('cloud')
    } catch (e) {
      console.warn('[cloud]', e)
      setSaveState('failed')
    }
  }

  /** После входа: дни из облака — на это устройство (полка работает и без сети); свои дни без облака — предложить перенести. */
  const syncFromCloud = async () => {
    try {
      const remote = await cloudListDays()
      for (const d of remote) if (!(await getDay(d.id))) await saveDay(d)
      const ids = new Set(remote.map((d) => d.id))
      setCloudIds(ids)
      const localOnly = (await listDays()).filter((d) => !isDemo(d.id) && !ids.has(d.id)).map((d) => d.id)
      if (localOnly.length) setMovePrompt({ ids: localOnly, busy: false })
      setSaveState('cloud')
      await refreshDays()
    } catch (e) {
      console.warn('[cloud]', e)
      setSaveState('failed')
    }
  }

  const moveToCloud = async () => {
    if (!movePrompt) return
    setMovePrompt({ ...movePrompt, busy: true })
    setSaveState('saving')
    let ok = true
    for (const id of movePrompt.ids) {
      const d = await getDay(id)
      if (!d) continue
      try {
        await cloudSaveDay(d)
        setCloudIds((ids) => new Set(ids).add(id))
      } catch (e) {
        console.warn('[cloud]', e)
        ok = false
      }
    }
    setSaveState(ok ? 'cloud' : 'failed')
    setMovePrompt(null)
  }

  const refreshDays = useCallback(async () => {
    try {
      setDays([...demoDays, ...(await listDays())])
    } catch (e) {
      console.error('[store]', e)
      setDays(demoDays)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'shelf') return
    let last = ''
    let still = 0
    const since = performance.now()
    const place = () => {
      const w = worldRef.current
      if (!w) return
      const book = w.pageRects().right
      // пока человек входит и садится, а камера переезжает — подписи нет; появляется, когда кадр замер на ~1 с.
      // Человек не загрузился (нет файла, сеть) — через 15 с подпись всё равно появится.
      const busy = !w.personSettled && performance.now() - since < 15000
      const key = `${Math.round(book.x / 4)},${Math.round(book.y / 4)}`
      still = key === last && !busy ? still + 1 : 0
      last = key
      if (still < 3) {
        setCtaAt((cur) => (cur ? null : cur))
        setCtaReady(false)
        return
      }
      setCtaReady(true)
      const vw = innerWidth
      // закрытая книга лежит на месте правой страницы; подпись — слева от неё, по середине высоты
      // бирка «привязана» к книге: правым краем заходит на обложку
      const right = Math.round(vw - book.x - Math.min(34, book.w * 0.12))
      // бирка + полоска подсказки ≈ 104 px (на телефоне ×0.74) — не уходить за нижний край
      const ctaH = (innerHeight <= 560 || vw <= 600 ? 0.74 : 1) * 104
      const top = Math.round(Math.min(book.y + book.h * 0.3, innerHeight - ctaH - 6))
      const fits = book.x > 300 && book.w > 20 && top > 0 && top < innerHeight - 60
      const next = fits ? { right, top } : null
      setCtaAt((cur) => (cur && next && Math.abs(cur.right - next.right) < 3 && Math.abs(cur.top - next.top) < 3 ? cur : next))
    }
    place()
    const id = window.setInterval(place, 300)
    return () => window.clearInterval(id)
  }, [phase])

  // Мир сцены.
  useEffect(() => {
    let dead = false
    SpriteBank.load()
      .catch((err) => {
        console.error(err)
        return null
      })
      .then((bank) => {
        if (dead || !host.current) return
        const world = new World(host.current, bank)
        worldRef.current = world
        world.setPerson(personRef.current)
        // для отладки в консоли
        Object.assign(window, { world, songPlayer: () => songRef.current })
        world.idle()
        setPhase('shelf')
      })
    void refreshDays()
    return () => {
      dead = true
      worldRef.current?.dispose()
      worldRef.current = null
      songRef.current?.dispose()
      ytRef.current?.dispose()
      ytRef.current = null
    }
  }, [refreshDays])

  // Следим за проигрывателем сцены: пока идёт фильм, интерфейс поверх кадра прячется.
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = worldRef.current?.player
      setSceneFilm(!!p && p.playing && !p.ended)
    }, 150)
    return () => window.clearInterval(id)
  }, [])

  // Прямоугольники страниц для DOM-слоя записи.
  const measure = useCallback(() => {
    const w = worldRef.current
    if (!w) return
    const next = w.pageRects()
    // камера из глаз доезжает и потом дышит вместе с головой — мелкую дрожь (<2 px) не переносим в DOM
    setRects((cur) => {
      if (!cur) return next
      const near = (a: PageRects['left'], b: PageRects['left']) =>
        Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2 && Math.abs(a.w - b.w) < 2 && Math.abs(a.h - b.h) < 2
      return near(cur.left, next.left) && near(cur.right, next.right) && cur.scale === next.scale ? cur : next
    })
  }, [])
  // Запись глазами человека: страницы на экране двигаются вместе с камерой — следим за ними всё время.
  useEffect(() => {
    if (phase !== 'write' && phase !== 'directing') return
    let raf = 0
    const tick = () => {
      measure()
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const id = window.setInterval(measure, 250) // фоновая вкладка: rAF почти стоит
    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(id)
    }
  }, [phase, measure])
  useEffect(() => {
    if (phase !== 'write' && phase !== 'directing') return
    const ro = new ResizeObserver(() => requestAnimationFrame(measure))
    if (host.current) ro.observe(host.current)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [phase, measure])

  // Черновик → сцена.
  const caretRef = useRef<number | null>(null)
  /** кегль книги в долях ширины страницы (книга мельчит шрифт ступенями, пока текст не влезет) — поле ввода берёт тот же */
  const [pageFont, setPageFont] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (phase !== 'write' && phase !== 'directing') return
    const w = worldRef.current
    w?.setDraftText(text)
    const f = (w as unknown as { pageFontFrac?: () => number } | null)?.pageFontFrac?.()
    if (f && f !== pageFont) setPageFont(f)
    // setDraftText перерисовывает страницу — позицию курсора отправляем заново
    if (phase === 'write') (w as unknown as { setDraftCaret?: (p: number | null) => void } | null)?.setDraftCaret?.(caretRef.current)
  }, [text, phase])

  // Курсор: если сцена умеет рисовать его сама (setDraftCaret), передаём позицию символа.
  const sceneCaret = typeof (worldRef.current as unknown as { setDraftCaret?: unknown } | null)?.setDraftCaret === 'function'
  const onCaret = (pos: number | null) => {
    caretRef.current = pos
    const w = worldRef.current as unknown as { setDraftCaret?: (p: number | null) => void } | null
    w?.setDraftCaret?.(pos)
  }

  // Название песни по ссылке (oEmbed), с задержкой после ввода.
  useEffect(() => {
    if (song.kind !== 'link' || !isUrl(song.url) || song.title) return
    const url = song.url!
    const t = setTimeout(async () => {
      const meta = await linkMeta(url)
      if (meta.title) setSong((s) => (s.kind === 'link' && s.url === url && !s.title ? { ...s, ...meta } : s))
    }, 600)
    return () => clearTimeout(t)
  }, [song])

  // Esc — пропустить фильм.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const p = playerRef.current
      const sp = worldRef.current?.player
      if (e.key === 'Escape' && phase !== 'write' && sp && sp.playing) sp.seek(sp.duration)
      if (phase === 'film' && p && e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        if (p.playing) {
          p.pause()
          songRef.current?.pause()
          if (ytOn.current) ytRef.current?.pause()
        } else {
          if (ytOn.current) ytRef.current?.resume()
          else void songRef.current?.play().catch(() => {})
          p.play()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  // ---------- переходы ----------

  const stopFilm = () => {
    playerRef.current?.pause()
    playerRef.current = null
    songRef.current?.pause()
    ytRef.current?.pause()
    ytOn.current = false
  }

  const toShelf = () => {
    stopFilm()
    worldRef.current?.setDraftPhotos([])
    worldRef.current?.idle()
    setCurrent(null)
    setStatus('')
    setPhase('shelf')
  }

  const toWrite = (draft?: { text: string; photos: PreparedPhoto[] }) => {
    // правка уже сохранённого дня перезапишет его, а не добавит второй корешок (editDay ставит id сам)
    if (!draft) {
      editingId.current = current?.saved && !isDemo(current.day.id) ? current.day.id : null
      editingMeta.current = editingId.current && current ? { date: current.day.date, createdAt: current.day.createdAt } : null
    }
    overwriteAsked.current = false
    stopFilm()
    const w = worldRef.current
    if (!w) return
    w.enterWriteMode()
    w.setDraftText(draft ? draft.text : text)
    w.setDraftPhotos((draft ? draft.photos : photos).map((p) => p.image))
    setCurrent(null)
    setStatus('')
    setNeed([])
    setPhase('write')
    requestAnimationFrame(() => requestAnimationFrame(measure))
    setTimeout(measure, 80) // запасной замер: в фоновой вкладке rAF не идёт
  }

  /** «Править» у сохранённого дня: запись с его текстом, фото и песней; «Собрать» спросит, перезаписать ли. Демо — копия. */
  const editDay = () => {
    if (!current) return
    const d = current.day
    const demo = isDemo(d.id)
    editingId.current = demo ? null : d.id
    editingMeta.current = demo ? null : { date: d.date, createdAt: d.createdAt }
    const draftSong = songDraftOf(d.song)
    setText(d.text)
    setPhotos(current.photos)
    setSong(draftSong)
    setSongAdvice(null)
    adviceFor.current = null
    if (d.song?.kind === 'file' && d.song.blob) songLoadedFor.current = d.song.blob
    // без изменений «Собрать» возьмёт этот же сценарий — без ИИ и без лимита
    lastBuilt.current = { key: buildKey(d.text, current.photos, draftSong), script: d.script, source: d.source }
    draftPending.current = true
    aiDraft()
    toWrite({ text: d.text, photos: current.photos })
  }

  newDayRef.current = () => newDay()
  const newDay = () => {
    editingId.current = null
    editingMeta.current = null
    overwriteAsked.current = false
    // новый черновик: лимит дней с ИИ решится при «Собрать»; записка — если на сегодня ИИ уже нет
    aiDraft()
    setAiNote(aiDaysLeft() > 0 ? '' : AI_DAY_NOTE)
    // Ушли на полку посреди записи — черновик ждёт; после собранного дня начинаем с чистого листа.
    const keep = draftPending.current
    if (!keep) {
      setText('')
      setPhotos([])
      setSong(EMPTY_SONG)
      setSongAdvice(null)
      adviceFor.current = null
      songLoadedFor.current = null
    }
    draftPending.current = true
    songRef.current?.pause()
    const w = worldRef.current
    if (w) {
      w.enterWriteMode()
      w.setDraftText(keep ? text : '')
      w.setDraftPhotos(keep ? photos.map((p) => p.image) : [])
    }
    setCurrent(null)
    setStatus('')
    setNeed([])
    setPhase('write')
    requestAnimationFrame(() => requestAnimationFrame(measure))
    setTimeout(measure, 80) // запасной замер: в фоновой вкладке rAF не идёт
  }

  const captureCover = () =>
    new Promise<Blob | null>((resolve) => {
      const canvas = worldRef.current?.px.renderer.domElement
      if (!canvas) return resolve(null)
      try {
        canvas.toBlob((b) => resolve(b), 'image/png')
      } catch {
        resolve(null)
      }
    })

  /** Проиграть день. withSong — песня уже загружена в SongPlayer. */
  const startFilm = async (cur: Current, withSong: boolean) => {
    const w = worldRef.current
    if (!w) return
    stopFilm()
    w.setDraftPhotos(cur.photos.map((p) => p.image))
    let clock: (() => number) | undefined
    let beatTimes: number[] | undefined
    const sp = songRef.current
    if (withSong && sp) {
      try {
        sp.seek(0)
        await sp.play()
        clock = makeSongClock(sp)
        beatTimes = sp.analysis?.beatTimes
      } catch (e) {
        console.warn('[song] не запустилась, фильм идёт без звука', e)
      }
    }
    // ссылка YouTube: фильм ждёт, пока песня реально заиграет (реклама, загрузка), часы — от плеера
    let yt: YouTubeSong | null = null
    const ytId = !withSong && cur.day.song?.kind === 'link' ? cur.day.song.yt ?? youTubeId(cur.day.song.url) : null
    if (ytId) {
      const y = getYt()
      setStatus('включаю песню…')
      try {
        await y.load(ytId, ytBpm(cur.day.song))
        if (await y.start()) {
          yt = y
          clock = y.clock()
          beatTimes = y.beatTimes()
        } else console.warn('[youtube] не заиграла, фильм идёт без звука', y.error)
      } catch (e) {
        console.warn('[youtube] не загрузилась, фильм идёт без звука', e)
      }
      setStatus('')
    }
    ytOn.current = !!yt
    // форма песни для хореографа (план 15): файл — доли и кривая громкости из анализа; YouTube — известный темп
    const shape: SongShape | undefined = clock && sp && !yt && sp.analysis
      ? { bpm: sp.analysis.bpm || undefined, beatTimes, energyCurve: sp.analysis.energyCurve, duration: sp.analysis.duration }
      : yt
        ? { bpm: ytBpm(cur.day.song), beatTimes }
        : undefined
    const player = w.playDay(cur.day.text, cur.day.script, { seed: cur.day.seed, beatTimes, clock, photoCount: cur.photos.length, dayId: cur.day.id, song: shape })
    if (clock && sp && !yt) player.setAudio(sp)
    if (yt) player.setAudio(yt)
    playerRef.current = player
    player.onEnd(async () => {
      if (clock && sp && !yt) fadeOut(sp)
      if (yt) {
        yt.fadeOut()
        ytOn.current = false
      }
      const cover = await captureCover()
      // Новый день сохраняется сам: «На полку» без «Сохранить» не должно терять запись.
      let saved = cur.saved
      if (!saved) {
        try {
          await persistDay({ ...cur.day })
          saved = true
          setStatus('день сохранён на полке')
          void refreshDays()
        } catch (e) {
          console.error('[store]', e)
          setStatus('не получилось сохранить — нажми «Сохранить» ещё раз')
        }
      }
      setCurrent((c) => (c && c.day.id === cur.day.id ? { ...c, cover: cover ?? c.cover, saved: c.saved || saved } : c))
      setPhase('after')
    })
    setCurrent(cur)
    setPhase('film')
  }

  // ---------- запись ----------

  const addFiles = async (files: File[]) => {
    setPhotoBusy(true)
    try {
      const room = MAX_PHOTOS - photos.length
      const next = [...photos]
      const sorted = byTakenTime(files)
      const failed: File[] = []
      for (const f of sorted.slice(0, room)) {
        try {
          const p = await preparePhoto(f)
          next.push(p)
          // карточку снимка просим сразу: придёт через 3–5 с, тот же снимок второй раз — из кэша
          const key = photoHash(p.dataUrl)
          void requestPhotoCard(p.dataUrl, text).then((card) => setPhotoCards((c) => ({ ...c, [key]: card })))
        } catch (e) {
          console.warn('[photos] не читается', f.name, e)
          failed.push(f)
        }
      }
      setPhotoNote(photoProblem(failed, Math.max(0, sorted.length - room)))
      setPhotos(next)
      worldRef.current?.setDraftPhotos(next.map((p) => p.image))
      setNeed((n) => n.filter((x) => x !== 'photos'))
    } finally {
      setPhotoBusy(false)
    }
  }

  const removeLastPhoto = () => {
    const next = photos.slice(0, -1)
    setPhotos(next)
    worldRef.current?.setDraftPhotos(next.map((p) => p.image))
  }

  const changeSong = (s: SongDraft) => {
    setSong(s)
    setNeed((n) => n.filter((x) => x !== 'song'))
    if (s.kind === 'file' && s.file && songLoadedFor.current !== s.file) {
      const file = s.file
      songLoadedFor.current = file
      const sp = getSong()
      sp.load(file)
        .then(() => sp.analysisReady)
        .then((a) => setSong((cur) => (cur.file === file ? { ...cur, analyzing: false, bpm: a?.bpm || undefined } : cur)))
        .catch((e) => {
          console.warn('[song]', e)
          setSong((cur) => (cur.file === file ? { ...cur, analyzing: false } : cur))
        })
    }
  }

  const collect = async () => {
    // песня не обязательна (план 14 § 2): нет — фильм идёт как есть; ссылка годится и без адреса, если есть название
    // (песню назвал ИИ в записке «ты не поставил песню»)
    // песня обязательна (план 15: история подстраивается под песню): одна из предложенных ИИ, свой файл или ссылка
    const songOk = (song.kind === 'file' && !!song.file) || (song.kind === 'link' && (isUrl(song.url) || !!song.title))
    const miss = missingParts({ text, photos: photos.length, song: songOk })
    if (miss.length) {
      setNeed(miss)
      return
    }
    setNeed([])
    // правим сохранённый день — сначала спросить: перезаписать его или сохранить как новый
    if (editingId.current && !overwriteAsked.current) {
      setAskOverwrite(true)
      return
    }
    // тот же текст, фото и песня, что у последнего собранного — тот же сценарий: без ИИ и без лимита
    const reuse = lastBuilt.current?.key === buildKey(text, photos, song) ? lastBuilt.current : null
    // лимит дней с ИИ (7 за скользящую неделю): нет — этот день соберёт запасной режиссёр, фильм всё равно будет
    const ai = reuse ? true : beginAiDay()
    setAiNote(ai ? '' : AI_DAY_NOTE)
    const sp = song.kind === 'file' ? getSong() : null
    // Звук разблокируется в том же клике, иначе браузер не даст играть после ответа режиссёра.
    if (draftYt) ytRef.current?.prime()
    if (sp) await unlockSong(sp)
    setPhase('directing')
    // живое ожидание (план 13 § 5): рука постукивает ручкой, человечек выглядывает из книги
    worldRef.current?.setWaiting(true)
    try {
      await collectDirected(sp, ai, reuse)
    } catch (e) {
      worldRef.current?.setWaiting(false)
      throw e
    }
  }

  const collectDirected = async (sp: ReturnType<typeof getSong> | null, ai = true, reuse: { script: DayScript; source: StoredDay['source'] } | null = null) => {
    const input: DirectorInput = {
      text: text.trim(),
      // род героя для строк рассказа: «я встретился» / «я встретилась»
      hero: person,
      photos: photos.map((p) => p.dataUrl),
      // карточки снимков: у всех есть — режиссёру не нужны сами картинки; нет — directDay подождёт до 6 с
      photoCards: photos.map(cardOf),
      song:
        song.kind === 'file'
          ? { title: song.title, measuredTempoBpm: song.bpm, ...(sp?.analysis ? { energy: sp.analysis.energy } : {}) }
          : song.kind === 'link'
            ? {
                title: song.title || undefined,
                artist: song.artist || undefined,
                // история под песню: известный темп (список), энергия и «про что» песня
                ...(listedSong(song) ? { bpm: listedSong(song)!.bpm, mood: listedSong(song)!.mood } : {}),
                ...(typeof song.energy === 'number' ? { energy: song.energy } : {}),
                ...(song.why && !listedSong(song) ? { mood: song.why } : {}),
                // «Почему так»: «Песня: предложил ИИ по записи и фото — {why}» (общее «почему» ответа /api/song)
                ...(song.suggested ? { suggested: { why: songAdvice?.why || song.why || '', photos: !!songAdvice?.withPhotos } } : {}),
              }
            : null,
    }
    const res: { script: DayScript; source: StoredDay['source']; reason?: string } = reuse ? { script: reuse.script, source: reuse.source } : await directDay(input, { offline: !ai, user: currentUser()?.id })
    lastBuilt.current = { key: buildKey(text, photos, song), script: res.script, source: res.source }
    // сервер сказал «лимит дней с ИИ» — на сегодня всё; день уже собран запасным режиссёром
    if (ai && res.reason?.includes('day_limit')) {
      aiRefused()
      setAiNote(AI_DAY_NOTE)
    }
    let script = song.kind === 'link' ? applyKnobs(res.script, { tempo: song.tempo, energy: song.energy }) : res.script
    const photoPalette = dayPalette(photos.map((p) => p.swatches))
    // Запасной режиссёр фото не видит — палитру берём из фото.
    if (res.source === 'fallback' && photoPalette.length) script = { ...script, palette_hint: photoPalette.slice(0, 4) }
    if (sp) {
      await Promise.race([sp.analysisReady, new Promise((r) => setTimeout(r, 6000))])
    }
    const storedSong: StoredSong | null =
      song.kind === 'file'
        ? { kind: 'file', blob: song.file, title: song.title, bpm: sp?.analysis?.bpm || song.bpm }
        : song.kind === 'link'
          ? {
              kind: 'link',
              url: song.url,
              title: song.title,
              artist: song.artist,
              tempo: song.tempo,
              energy: song.energy,
              ...(draftYt ? { yt: draftYt } : {}),
              ...(song.suggested ? { suggested: true, why: songAdvice?.why || song.why } : {}),
            }
          : null
    const now = new Date()
    // перезапись дня: тот же id, дата и время создания остаются
    const meta = editingId.current ? editingMeta.current : null
    const day: StoredDay = {
      id: editingId.current ?? newDayId(now),
      date: meta?.date ?? localDate(now),
      text: input.text,
      photos: photos.map((p) => p.blob),
      photoPalette,
      song: storedSong,
      script,
      source: res.source,
      seed: seedFromString(input.text + now.toISOString().slice(0, 10)),
      createdAt: meta?.createdAt ?? now.getTime(),
    }
    if (res.source === 'fallback') console.info('[director] запасной сценарий:', res.reason)
    draftPending.current = false
    clearDraft()
    worldRef.current?.setWaiting(false)
    await startFilm({ day, photos, stored: false, saved: false }, !!sp)
  }

  // ---------- полка и после фильма ----------

  openDayRef.current = (d: StoredDay) => void openDay(d)
  const openDay = async (d: StoredDay) => {
    setStatus('')
    // день с песней YouTube: в клике по книге разблокируем плеер (если ролик уже готов)
    const dYt = d.song?.kind === 'link' ? d.song.yt ?? youTubeId(d.song.url) : null
    if (dYt) {
      const y = getYt()
      if (y.videoId === dYt) y.prime()
      else void y.load(dYt, knobBpm(d.song?.tempo)).catch(() => {})
    }
    setPhase('opening')
    let prepared: PreparedPhoto[] = []
    try {
      prepared = await Promise.all(d.photos.map((b) => photoFromStored(b)))
    } catch (e) {
      console.warn('[photos]', e)
    }
    let withSong = false
    if (d.song?.kind === 'file' && d.song.blob) {
      const sp = getSong()
      try {
        if (songLoadedFor.current !== d.song.blob) {
          songLoadedFor.current = d.song.blob
          await sp.load(d.song.blob)
        }
        await Promise.race([sp.analysisReady, new Promise((r) => setTimeout(r, 4000))])
        withSong = true
      } catch (e) {
        console.warn('[song]', e)
      }
    }
    await startFilm({ day: d, photos: prepared, stored: true, saved: true }, withSong)
  }

  const save = async () => {
    if (!current) return
    try {
      await persistDay({ ...current.day })
      setCurrent({ ...current, saved: true, stored: true })
      setStatus('день на полке')
      await refreshDays()
    } catch (e) {
      console.error('[store]', e)
      setStatus('не получилось сохранить')
    }
  }

  const download = async () => {
    if (!current) return
    try {
      const zip = await exportDayZip(current.day, current.cover)
      downloadBlob(zip, `${dayFolderName(current.day)}.zip`)
    } catch (e) {
      console.error('[zip]', e)
      setStatus('не получилось собрать ZIP')
    }
  }

  const replay = () => {
    if (!current) return
    const withSong = current.day.song?.kind === 'file' && !!songRef.current && songLoadedFor.current === current.day.song.blob
    ytRef.current?.prime()
    void startFilm(current, withSong)
  }

  const remove = async (confirmed = false) => {
    if (!current || isDemo(current.day.id)) return
    // подтверждение — запиской «канцелярия», не системным окном
    if (!confirmed) {
      setAskDelete(true)
      return
    }
    setAskDelete(false)
    await deleteDay(current.day.id)
    if (cloudIds.has(current.day.id)) void cloudDeleteDay(current.day.id).catch((e) => console.warn('[cloud]', e))
    await refreshDays()
    toShelf()
  }

  // вошли (или уже были вошедшими при открытии) — подтянуть облако; вышли — значок «только на устройстве»
  useEffect(() => {
    if (!cloudReady) return
    if (cloudUser) void syncFromCloud()
    else {
      setCloudIds(new Set())
      setSaveState('local')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudUser?.id])

  // обложки для 2D-списка «Мои дни»: первое фото дня (адреса живут, пока список открыт)
  const [covers, setCovers] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!myDaysOpen) return
    const urls: Record<string, string> = {}
    for (const d of days) if (d.photos[0]) urls[d.id] = URL.createObjectURL(d.photos[0])
    setCovers(urls)
    return () => Object.values(urls).forEach((u) => URL.revokeObjectURL(u))
  }, [myDaysOpen, days])

  return (
    <div className="app">
      <div ref={host} className="stage" />
      <div className={`overlay phase-${phase}${sceneFilm ? ' scene-film' : ''}`}>
        {cloudReady && phase !== 'film' && !welcome && (
          <CloudBadge state={saveState} email={cloudUser?.email} onClick={() => setAccountOpen((o) => !o)} />
        )}
        {cloudReady && accountOpen && (
          <AccountCard
            email={cloudUser?.email ?? null}
            onDays={() => {
              setMyDaysOpen(true)
              setAccountOpen(false)
            }}
            onSignOut={() => {
              void signOut()
              setAccountOpen(false)
            }}
            onSignIn={() => {
              setWelcome(true)
              setAccountOpen(false)
            }}
            onClose={() => setAccountOpen(false)}
            person={person}
            onPerson={pickPerson}
          />
        )}
        {phase === 'shelf' && !myDaysOpen && !welcome && (
          <button className="my-days-btn" onClick={() => setMyDaysOpen(true)}>
            мои дни · {days.length}
          </button>
        )}
        {myDaysOpen && (phase === 'shelf' || phase === 'after') && (
          <DaysBook
            days={days}
            covers={covers}
            inCloud={cloudIds}
            onOpen={(d) => {
              setMyDaysOpen(false)
              void openDay(d)
            }}
            onClose={() => setMyDaysOpen(false)}
          />
        )}
        {movePrompt && <MovePrompt count={movePrompt.ids.length} busy={movePrompt.busy} onYes={() => void moveToCloud()} onNo={() => setMovePrompt(null)} />}
        {welcome && (
          <Welcome
            onSignIn={async (e, p) => {
              await signIn(e, p)
              setWelcome(false)
            }}
            onSignUp={async (e, p) => {
              await signUp(e, p)
              setWelcome(false)
            }}
            onLocal={() => {
              chooseLocalOnly(true)
              setWelcome(false)
            }}
          />
        )}
        {(phase === 'shelf' || phase === 'opening' || (phase === 'film' && current?.stored === true)) && (
          <Shelf days={days} hidden={phase !== 'shelf' || sceneFilm} onOpen={(d) => void openDay(d)} onNew={newDay} />
        )}
        {portrait && !rotateDismissed && phase !== 'film' && phase !== 'after' && !sceneFilm && (
          <PinNote className="rotate-hint" role="note" seed="rotate">
            <span>поверни телефон горизонтально — книга раскроется шире</span>
            <SlipButton onClick={() => setRotateDismissed(true)} seed="rotate-ok">ок</SlipButton>
          </PinNote>
        )}
        {/* правка сохранённого дня: перезаписать его или сохранить как новый (записка «канцелярия») */}
        {askOverwrite && phase === 'write' && (
          <PinNote className="ask-note" role="dialog" seed="overwrite" style={ASK_STYLE}>
            <span>перезаписать этот день?</span>
            <SlipButton
              seed="overwrite-yes"
              onClick={() => {
                overwriteAsked.current = true
                setAskOverwrite(false)
                void collect()
              }}
            >
              перезаписать
            </SlipButton>
            <SlipButton
              seed="overwrite-new"
              onClick={() => {
                editingId.current = null
                editingMeta.current = null
                overwriteAsked.current = true
                setAskOverwrite(false)
                void collect()
              }}
            >
              сохранить как новый
            </SlipButton>
            <SlipButton seed="overwrite-no" onClick={() => setAskOverwrite(false)}>
              отмена
            </SlipButton>
          </PinNote>
        )}
        {/* удалить день — с подтверждением; удаляет и из облака */}
        {askDelete && current && phase === 'after' && (
          <PinNote className="ask-note" role="dialog" seed="delete" style={ASK_STYLE}>
            <span>удалить день «{current.day.script.title}»? вернуть не получится</span>
            <SlipButton seed="delete-yes" onClick={() => void remove(true)}>
              удалить
            </SlipButton>
            <SlipButton seed="delete-no" onClick={() => setAskDelete(false)}>
              оставить
            </SlipButton>
          </PinNote>
        )}
        {phase === 'shelf' && !sceneFilm && <PersonPick value={person} onChange={pickPerson} />}
        {/* «Кто ведёт дневник?» — один раз, на первом экране полки (после входа) */}
        {phase === 'shelf' && !sceneFilm && !welcome && <HeroPick value={person} onChange={pickPerson} />}
        {phase === 'shelf' && !sceneFilm && ctaReady && (
          <div className={`shelf-cta${ctaAt ? ' at-book' : ''}`} style={ctaAt ? { right: ctaAt.right, top: ctaAt.top, bottom: 'auto' } : undefined}>
            <TagButton onClick={newDay} seed="cta">
              {draftPending.current && (text || photos.length) ? 'Дописать день' : 'Записать день'}
            </TagButton>
            {draftPending.current && (text || photos.length) ? (
              <SlipButton
                seed="cta-fresh"
                onClick={() => {
                  // новый день — с чистого листа: начатый черновик стирается
                  draftPending.current = false
                  clearDraft()
                  newDay()
                }}
              >
                с чистого листа
              </SlipButton>
            ) : null}
            <span className="cta-hint">
              <Sheet edge="torn" w={170} h={24} seed="cta-hint" />
              <span>{draftPending.current && (text || photos.length) ? 'начатый день ждёт · или нажми на книгу' : 'или нажми на книгу'}</span>
            </span>
          </div>
        )}
        {(phase === 'write' || phase === 'directing' || (phase === 'film' && current?.stored === false)) && (
          <WriteLayer
            rects={rects}
            text={text}
            onText={(t) => {
              setText(t)
              if (need.includes('text')) setNeed((n) => n.filter((x) => x !== 'text'))
            }}
            photoCount={photos.length}
            onAddFiles={(f) => void addFiles(f)}
            onRemoveLastPhoto={removeLastPhoto}
            sceneCaret={sceneCaret}
            onCaret={onCaret}
            song={song}
            // песня обязательна (план 15): без неё сургуч «Собрать» бледный, под страницей «♪ выбери песню дня»
            songReady={(song.kind === 'file' && !!song.file) || (song.kind === 'link' && (isUrl(song.url) || !!song.title))}
            onSong={changeSong}
            songAdvice={songAdvice}
            need={need}
            busy={phase !== 'write'}
            busyText={phase === 'directing' ? busyText : undefined}
            hidden={phase === 'film'}
            photoBusy={photoBusy}
            photoNote={photoNote}
            pageFont={pageFont}
            photoSeen={photoCardNote([...photos].reverse().map(cardOf).find(Boolean))}
            onCollect={() => void collect()}
            onBack={toShelf}
          />
        )}
        {(phase === 'film' || (sceneFilm && phase !== 'write' && phase !== 'directing' && phase !== 'after')) && (
          <div className="film-hint">
            <FlagButton
              seed="skip"
              onClick={() => {
                const p = playerRef.current ?? worldRef.current?.player
                if (p) p.seek(p.duration)
              }}
            >
              пропустить »
            </FlagButton>
          </div>
        )}
        {phase === 'after' && current && !myDaysOpen && (
          <DayPager days={days} currentId={current.day.id} onOpen={(d) => void openDay(d)} />
        )}
        {phase === 'after' && current && (
          <Bookmark
            script={current.day.script}
            source={current.day.source}
            saved={current.saved}
            canSave={!current.stored}
            canDelete={current.stored && !isDemo(current.day.id)}
            onSave={() => void save()}
            onDownload={() => void download()}
            onReplay={replay}
            onDelete={() => void remove()}
            onShelf={toShelf}
            onNew={newDay}
            onEdit={current.stored ? editDay : () => toWrite()}
            status={status}
          />
        )}
      </div>
    </div>
  )
}
