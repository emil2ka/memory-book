// Кассета в углу стола: аудиофайл или ссылка; для ссылки — две ручки (темп, энергия).
import { useRef, useState, type CSSProperties, type DragEvent } from 'react'

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
}

export function Cassette({ song, onSong, need, disabled, style }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'file' | 'link'>(song.kind === 'link' ? 'link' : 'file')
  const [drag, setDrag] = useState(false)

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

  return (
    <div className={`cassette${need ? ' need' : ''}${drag ? ' drag' : ''}`} style={style} onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={onDrop}>
      <div className="tape">
        <div className="tape-label">{label || 'песня дня'}</div>
        <div className="reels">
          <span className={`reel${disabled ? ' spin' : ''}`} />
          <span className="window" />
          <span className={`reel${disabled ? ' spin' : ''}`} />
        </div>
      </div>
      <div className="tabs">
        <button className={`link${mode === 'file' ? ' on' : ''}`} onClick={() => setMode('file')} disabled={disabled}>файл</button>
        <button className={`link${mode === 'link' ? ' on' : ''}`} onClick={() => setMode('link')} disabled={disabled}>ссылка</button>
      </div>
      {mode === 'file' ? (
        <div className="cassette-body" key="file">
          <button className="link" onClick={() => fileRef.current?.click()} disabled={disabled}>
            {song.kind === 'file' ? 'другой файл' : 'выбрать аудиофайл'}
          </button>
          <input ref={fileRef} type="file" accept="audio/*" hidden onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = '' }} />
          {song.kind === 'file' && <div className="small">{song.analyzing ? 'слушаю темп…' : song.bpm ? `${Math.round(song.bpm)} bpm` : 'темп не найден'}</div>}
        </div>
      ) : (
        <div className="cassette-body" key="link">
          <input
            className="field"
            type="url"
            placeholder="ссылка на песню"
            value={song.kind === 'link' ? song.url ?? '' : ''}
            onChange={(e) => onSong({ ...song, kind: 'link', file: undefined, url: e.target.value })}
            disabled={disabled}
          />
          <input
            className="field"
            type="text"
            placeholder="исполнитель — название"
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
            <a className="link" href={song.url} target="_blank" rel="noreferrer noopener">открыть песню ↗</a>
          )}
        </div>
      )}
    </div>
  )
}

function Knob(p: { label: string; value?: number; onChange: (v: number) => void; left: string; right: string; disabled: boolean }) {
  return (
    <label className="knob">
      <span className="small">{p.label}{p.value === undefined ? ' · авто' : ''}</span>
      <input type="range" min={0} max={1} step={0.01} value={p.value ?? 0.5} onChange={(e) => p.onChange(Number(e.target.value))} disabled={p.disabled} />
      <span className="ends"><span>{p.left}</span><span>{p.right}</span></span>
    </label>
  )
}
