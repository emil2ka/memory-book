// Кассета в углу стола: аудиофайл или ссылка; для ссылки — две ручки (темп, энергия).
import { useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { CardButton, Icon, Sheet, SlipButton, Squiggle } from './paper'

export interface SongDraft {
  kind: 'none' | 'file' | 'link'
  file?: File
  url?: string
  title?: string
  artist?: string
  /** ручки 0..1; undefined — «как оценит режиссёр» */
  tempo?: number
  energy?: number
  bpm?: number
  analyzing?: boolean
}

interface Props {
  song: SongDraft
  onSong: (s: SongDraft) => void
  need: boolean
  disabled: boolean
  style: CSSProperties
  /** Низкий экран (телефон горизонтально): кассета свёрнута в значок и раскрывается по нажатию. */
  compact?: boolean
}

export function Cassette({ song, onSong, need, disabled, style, compact }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'file' | 'link'>(song.kind === 'link' ? 'link' : 'file')
  const [drag, setDrag] = useState(false)
  const [open, setOpen] = useState(false)

  const takeFile = (f: File | undefined) => {
    if (!f || !(f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(f.name))) return
    onSong({ kind: 'file', file: f, title: f.name.replace(/\.[^.]+$/, ''), analyzing: true })
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    takeFile(e.dataTransfer.files[0])
  }

  const label =
    song.kind === 'file' ? song.title || 'кассета' : song.kind === 'link' ? [song.artist, song.title].filter(Boolean).join(' — ') || song.url || '' : ''

  const tempo =
    song.kind === 'file'
      ? song.analyzing
        ? 'слушаю темп…'
        : song.bpm
          ? `темп ${Math.round(song.bpm)} BPM`
          : 'темп не найден'
      : song.kind === 'link'
        ? song.tempo === undefined
          ? 'темп · авто'
          : `темп · ${song.tempo < 0.34 ? 'медленно' : song.tempo > 0.66 ? 'быстро' : 'средне'}`
        : null

  if (compact && !open) {
    return (
      // мало места рядом с книгой: та же нарисованная кассета (по размеру свободного угла), по нажатию — выбор файла/ссылки
      <button className={`cassette chip${need ? ' need' : ''}`} style={style} onClick={() => setOpen(true)} disabled={disabled} aria-label="Песня дня">
        <span className="cass-shell">
          <span className="cass-head">
            <Icon name="note" size={16} />
            <span className="cass-title">{label || 'Песня дня'}</span>
            <Icon name="heart" size={12} className="cass-heart" />
          </span>
          <Squiggle w={90} className="cass-line" />
          <span className={`cass-reel l${disabled ? ' spin' : ''}`} aria-hidden />
          <span className={`cass-reel r${disabled ? ' spin' : ''}`} aria-hidden />
          <span className="cass-tempo chip-act">
            <Sheet edge="soft" w={110} h={22} seed="cass-tempo" />
            <span>{song.kind === 'none' ? 'добавить песню ▸' : song.analyzing ? 'слушаю темп…' : tempo ?? 'сменить ▸'}</span>
          </span>
        </span>
      </button>
    )
  }

  return (
    <div className={`cassette${need ? ' need' : ''}${drag ? ' drag' : ''}${compact ? ' popped' : ''}`} style={style} onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      {/* корпус — нарисованная кассета (assets/ui/cassette.webp); надпись, темп и катушки поверх */}
      <div className="cass-shell">
        <div className="cass-head">
          <Icon name="note" size={16} />
          <span className="cass-title">{label || 'Песня дня'}</span>
          <Icon name="heart" size={12} className="cass-heart" />
        </div>
        <Squiggle w={90} className="cass-line" />
        <span className={`cass-reel l${disabled ? ' spin' : ''}`} aria-hidden />
        <span className={`cass-reel r${disabled ? ' spin' : ''}`} aria-hidden />
        {tempo && (
          <div className="cass-tempo">
            <Sheet edge="soft" w={110} h={22} seed="cass-tempo" />
            <span>{tempo}</span>
          </div>
        )}
        <div className="cass-keys" aria-hidden>
          <span>◂◂</span><span>▶</span><span>▸▸</span>
        </div>
      </div>
      <div className="cass-slip">
        <Sheet edge="torn" w={190} h={120} seed="cass-slip" />
        {need && song.kind === 'none' && <div className="need-text">добавь песню дня: файл или ссылку</div>}
        <div className="tabs" role="group" aria-label="откуда песня">
          <SlipButton on={mode === 'file'} onClick={() => setMode('file')} disabled={disabled} seed="tab-file">файл</SlipButton>
          <SlipButton on={mode === 'link'} onClick={() => setMode('link')} disabled={disabled} seed="tab-link">ссылка</SlipButton>
          {compact && <CardButton mini icon="fold" label="свернуть" tape={4} onClick={() => setOpen(false)} />}
        </div>
        {mode === 'file' ? (
          <div className="cassette-body" key="file">
            <SlipButton onClick={() => fileRef.current?.click()} disabled={disabled} seed="pick-file" className="wide">
              <Icon name="file" size={15} />
              {song.kind === 'file' ? 'другой файл' : 'выбрать аудиофайл'}
            </SlipButton>
            <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = '' }} />
          </div>
        ) : (
          <div className="cassette-body" key="link">
            <input
              className="field"
              type="url"
              placeholder="ссылка на песню"
              aria-label="ссылка на песню"
              value={song.kind === 'link' ? song.url ?? '' : ''}
              onChange={(e) => onSong({ ...song, kind: 'link', file: undefined, url: e.target.value })}
              disabled={disabled}
            />
            <input
              className="field"
              type="text"
              placeholder="исполнитель — название"
              aria-label="исполнитель — название"
              value={song.kind === 'link' ? [song.artist, song.title].filter(Boolean).join(' — ') : ''}
              onChange={(e) => {
                const [a, ...t] = e.target.value.split(/\s+[—-]\s+/)
                onSong({ ...song, kind: 'link', artist: t.length ? a : undefined, title: t.length ? t.join(' — ') : a })
              }}
              disabled={disabled}
            />
            <Knob label="темп" value={song.tempo} onChange={(v) => onSong({ ...song, kind: 'link', tempo: v })} left="медленно" right="быстро" disabled={disabled} />
            <Knob label="энергия" value={song.energy} onChange={(v) => onSong({ ...song, kind: 'link', energy: v })} left="тихо" right="громко" disabled={disabled} />
            {song.kind === 'link' && song.url && (
              <a className="ink-link" href={song.url} target="_blank" rel="noreferrer noopener">
                <Icon name="open" size={14} /> открыть песню
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Knob(p: { label: string; value?: number; onChange: (v: number) => void; left: string; right: string; disabled: boolean }) {
  return (
    <label className="knob">
      <span className="knob-label">{p.label}{p.value === undefined ? ' · авто' : ''}</span>
      <input type="range" min={0} max={1} step={0.01} value={p.value ?? 0.5} onChange={(e) => p.onChange(Number(e.target.value))} disabled={p.disabled} />
      <span className="ends"><span>{p.left}</span><span>{p.right}</span></span>
    </label>
  )
}
