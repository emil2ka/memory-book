import { useCallback, useEffect, useRef, useState } from 'react'
import { World } from './scene/World'
import { PALETTE, css } from './scene/palette'
import { SpriteBank } from './actors/sprites'
import { SongPlayer } from './audio/SongPlayer'
import { directDay } from './director'
import { dayPalette, photoFromStored, preparePhoto, type PreparedPhoto } from './photos'
import { deleteDay, demoDays, downloadBlob, exportDayZip, isDemo, listDays, localDate, newDayId, saveDay, dayFolderName, type StoredDay, type StoredSong } from './store'
import { seedFromString } from './timeline/rng'
import type { TimelinePlayer } from './timeline/Player'
import type { DirectorInput } from './types/script'
import { Bookmark } from './ui/Bookmark'
import type { SongDraft } from './ui/Cassette'
import { missingParts, type Need } from './ui/checks'
import { Shelf } from './ui/Shelf'
import { applyKnobs, fadeOut, linkMeta, makeSongClock, unlockSong } from './ui/song'
import { MAX_PHOTOS, WriteLayer, type PageRects } from './ui/WriteLayer'

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

function isUrl(s?: string) {
  if (!s) return false
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function App() {
  const host = useRef<HTMLDivElement>(null)
  const worldRef = useRef<World | null>(null)
  const songRef = useRef<SongPlayer | null>(null)
  const playerRef = useRef<TimelinePlayer | null>(null)
  const songLoadedFor = useRef<Blob | null>(null)

  const [phase, setPhase] = useState<Phase>('loading')
  const [days, setDays] = useState<StoredDay[]>(demoDays)
  const [rects, setRects] = useState<PageRects | null>(null)
  const [text, setText] = useState('')
  const [photos, setPhotos] = useState<PreparedPhoto[]>([])
  const [photoBusy, setPhotoBusy] = useState(false)
  const [song, setSong] = useState<SongDraft>(EMPTY_SONG)
  const [need, setNeed] = useState<Need[]>([])
  const [current, setCurrent] = useState<Current | null>(null)
  const [status, setStatus] = useState<string>('')
  /** В сцене идёт фильм (в том числе запущенный в обход App, например из консоли). */
  const [sceneFilm, setSceneFilm] = useState(false)

  const getSong = () => (songRef.current ??= new SongPlayer())

  // Цвета интерфейса — только из мастер-палитры сцены.
  useEffect(() => {
    const root = document.documentElement
    for (const [k, v] of Object.entries(PALETTE)) root.style.setProperty(`--${k}`, css(v))
  }, [])

  const refreshDays = useCallback(async () => {
    try {
      setDays([...demoDays, ...(await listDays())])
    } catch (e) {
      console.error('[store]', e)
      setDays(demoDays)
    }
  }, [])

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
    setRects(w.pageRects())
  }, [])
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
  useEffect(() => {
    if (phase !== 'write' && phase !== 'directing') return
    const w = worldRef.current
    w?.setDraftText(text)
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
        if (p.playing) { p.pause(); songRef.current?.pause() } else { void songRef.current?.play().catch(() => {}); p.play() }
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
  }

  const toShelf = () => {
    stopFilm()
    worldRef.current?.setDraftPhotos([])
    worldRef.current?.idle()
    setCurrent(null)
    setStatus('')
    setPhase('shelf')
  }

  const toWrite = () => {
    stopFilm()
    const w = worldRef.current
    if (!w) return
    w.enterWriteMode()
    w.setDraftText(text)
    w.setDraftPhotos(photos.map((p) => p.image))
    setCurrent(null)
    setStatus('')
    setNeed([])
    setPhase('write')
    requestAnimationFrame(() => requestAnimationFrame(measure))
    setTimeout(measure, 80) // запасной замер: в фоновой вкладке rAF не идёт
  }

  const newDay = () => {
    setText('')
    setPhotos([])
    setSong(EMPTY_SONG)
    songLoadedFor.current = null
    songRef.current?.pause()
    const w = worldRef.current
    if (w) {
      w.enterWriteMode()
      w.setDraftText('')
      w.setDraftPhotos([])
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
    const player = w.playDay(cur.day.text, cur.day.script, { seed: cur.day.seed, beatTimes, clock })
    if (clock && sp) player.setAudio(sp)
    playerRef.current = player
    player.onEnd(async () => {
      if (clock && sp) fadeOut(sp)
      const cover = await captureCover()
      setCurrent((c) => (c && c.day.id === cur.day.id ? { ...c, cover: cover ?? c.cover } : c))
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
      for (const f of files.slice(0, room)) {
        try {
          next.push(await preparePhoto(f))
        } catch (e) {
          console.warn('[photos] не читается', f.name, e)
        }
      }
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
    const songOk = (song.kind === 'file' && !!song.file) || (song.kind === 'link' && isUrl(song.url))
    const miss = missingParts({ text, photos: photos.length, song: songOk })
    if (miss.length) {
      setNeed(miss)
      return
    }
    setNeed([])
    const sp = song.kind === 'file' ? getSong() : null
    // Звук разблокируется в том же клике, иначе браузер не даст играть после ответа режиссёра.
    if (sp) await unlockSong(sp)
    setPhase('directing')

    const input: DirectorInput = {
      text: text.trim(),
      photos: photos.map((p) => p.dataUrl),
      song:
        song.kind === 'file'
          ? { title: song.title, measuredTempoBpm: song.bpm }
          : { title: song.title || undefined, artist: song.artist || undefined },
    }
    const res = await directDay(input)
    let script = song.kind === 'link' ? applyKnobs(res.script, { tempo: song.tempo, energy: song.energy }) : res.script
    const photoPalette = dayPalette(photos.map((p) => p.swatches))
    // Запасной режиссёр фото не видит — палитру берём из фото.
    if (res.source === 'fallback' && photoPalette.length) script = { ...script, palette_hint: photoPalette.slice(0, 4) }
    if (sp) {
      await Promise.race([sp.analysisReady, new Promise((r) => setTimeout(r, 6000))])
    }
    const storedSong: StoredSong =
      song.kind === 'file'
        ? { kind: 'file', blob: song.file, title: song.title, bpm: sp?.analysis?.bpm || song.bpm }
        : { kind: 'link', url: song.url, title: song.title, artist: song.artist, tempo: song.tempo, energy: song.energy }
    const now = new Date()
    const day: StoredDay = {
      id: newDayId(now),
      date: localDate(now),
      text: input.text,
      photos: photos.map((p) => p.blob),
      photoPalette,
      song: storedSong,
      script,
      source: res.source,
      seed: seedFromString(input.text + now.toISOString().slice(0, 10)),
      createdAt: now.getTime(),
    }
    if (res.source === 'fallback') console.info('[director] запасной сценарий:', res.reason)
    await startFilm({ day, photos, stored: false, saved: false }, !!sp)
  }

  // ---------- полка и после фильма ----------

  const openDay = async (d: StoredDay) => {
    setStatus('')
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
      await saveDay({ ...current.day })
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
    void startFilm(current, withSong)
  }

  const remove = async () => {
    if (!current || isDemo(current.day.id)) return
    if (!window.confirm(`Удалить день «${current.day.script.title}»? Это нельзя отменить.`)) return
    await deleteDay(current.day.id)
    await refreshDays()
    toShelf()
  }

  return (
    <div className="app">
      <div ref={host} className="stage" />
      <div className={`overlay phase-${phase}${sceneFilm ? ' scene-film' : ''}`}>
        {(phase === 'shelf' || phase === 'opening' || (phase === 'film' && current?.stored === true)) && (
          <Shelf days={days} hidden={phase !== 'shelf' || sceneFilm} onOpen={(d) => void openDay(d)} onNew={newDay} />
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
            onSong={changeSong}
            need={need}
            busy={phase !== 'write'}
            hidden={phase === 'film'}
            photoBusy={photoBusy}
            onCollect={() => void collect()}
            onBack={toShelf}
          />
        )}
        {(phase === 'film' || (sceneFilm && phase !== 'write' && phase !== 'directing' && phase !== 'after')) && (
          <div className="film-hint">
            <button
              className="link"
              onClick={() => {
                const p = playerRef.current ?? worldRef.current?.player
                if (p) p.seek(p.duration)
              }}
            >
              пропустить
            </button>
          </div>
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
            onEdit={current.stored ? undefined : toWrite}
            status={status}
          />
        )}
      </div>
    </div>
  )
}
