// Режим записи: DOM-слой, выровненный по страницам книги. Сам текст рисует сцена,
// textarea прозрачная — виден только курсор.
import { useRef, useState, type CSSProperties, type DragEvent } from 'react'
import type { Need } from './checks'
import { Cassette, type SongDraft } from './Cassette'

export interface PageRect { x: number; y: number; w: number; h: number }
export interface PageRects { left: PageRect; right: PageRect; scale: number }

export const MAX_PHOTOS = 5

interface Props {
  rects: PageRects | null
  text: string
  onText: (t: string) => void
  photoCount: number
  onAddFiles: (files: File[]) => void
  onRemoveLastPhoto: () => void
  song: SongDraft
  onSong: (s: SongDraft) => void
  need: Need[]
  busy: boolean
  photoBusy: boolean
  onCollect: () => void
  onBack: () => void
  /** спрятать (плавно) — идёт фильм */
  hidden?: boolean
  /** сцена рисует курсор сама — тогда курсор textarea прячем */
  sceneCaret?: boolean
  onCaret?: (pos: number | null) => void
}

const box = (r: PageRect): CSSProperties => ({ left: r.x, top: r.y, width: r.w, height: r.h })

export function WriteLayer(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  if (!p.rects) return null
  const { left, right, scale } = p.rects
  // Шрифт страницы: 14 px текстуры на 160 px ширины страницы (см. Book.ts), в CSS-пикселях.
  const fontPx = Math.max(10, Math.round((14 / 160) * left.w))
  const needs = (n: Need) => (p.need.includes(n) ? ' need' : '')

  const take = (list: FileList | null) => {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith('image/'))
    if (files.length) p.onAddFiles(files)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDrag(false)
    take(e.dataTransfer.files)
  }

  return (
    <div className={`write${p.busy ? ' busy' : ''}${p.hidden ? ' hidden' : ''}`} aria-hidden={p.hidden || undefined} style={{ ['--px' as string]: `${Math.max(2, Math.round(scale))}px` }}>
      <textarea
        className={`page-text${needs('text')}${p.sceneCaret ? ' scene-caret' : ''}`}
        onSelect={(e) => p.onCaret?.((e.target as HTMLTextAreaElement).selectionStart)}
        onBlur={() => p.onCaret?.(null)}
        style={{ ...box(left), fontSize: fontPx, lineHeight: 1.35, padding: `${Math.round(left.h * 0.06)}px ${Math.round(left.w * 0.08)}px` }}
        value={p.text}
        onChange={(e) => {
          p.onCaret?.(e.target.selectionStart)
          p.onText(e.target.value)
        }}
        placeholder=""
        spellCheck={false}
        autoFocus
        maxLength={1600}
        aria-label="Текст дня"
        disabled={p.busy}
      />
      <div className="hint" style={{ left: left.x, top: left.y + left.h + 6, width: left.w }}>
        {p.need.includes('text') ? 'напиши хотя бы два предложения' : 'свет, звук, запах, люди, температура'}
      </div>

      <div
        className={`page-photos${needs('photos')}${drag ? ' drag' : ''}${p.photoCount ? ' has' : ''}`}
        style={box(right)}
        onClick={() => !p.busy && p.photoCount < MAX_PHOTOS && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        role="button"
        aria-label="Добавить фото"
      >
        {p.photoCount === 0 && <span className="drop-label">{p.photoBusy ? 'проявляю…' : 'перетащи сюда 1–5 фото\nили нажми'}</span>}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { take(e.target.files); e.target.value = '' }} />
      </div>
      <div className="hint right" style={{ left: right.x, top: right.y + right.h + 6, width: right.w }}>
        {p.photoBusy ? 'проявляю фото…' : p.photoCount ? (
          <>
            фото {p.photoCount}/{MAX_PHOTOS}
            {p.photoCount < MAX_PHOTOS && <button className="link" onClick={() => fileRef.current?.click()} disabled={p.busy}>ещё</button>}
            <button className="link" onClick={p.onRemoveLastPhoto} disabled={p.busy}>убрать последнее</button>
          </>
        ) : p.need.includes('photos') ? 'нужно хотя бы одно фото' : ''}
      </div>

      <Cassette
        style={{ left: right.x + right.w + 18 * Math.max(1, scale / 2), top: right.y + right.h * 0.42 }}
        song={p.song}
        onSong={p.onSong}
        need={p.need.includes('song')}
        disabled={p.busy}
      />

      <button
        className={`corner${p.busy ? ' thinking' : ''}`}
        style={{ left: right.x + right.w - right.w * 0.16, top: right.y + right.h - right.w * 0.16, width: right.w * 0.16, height: right.w * 0.16 }}
        onClick={p.onCollect}
        disabled={p.busy}
        aria-label="Собрать день"
        title="Собрать"
      >
        <span className="corner-fold" />
        <span className="corner-label">{p.busy ? 'собираю…' : 'Собрать'}</span>
      </button>

      {!p.busy && (
        <button className="link back" style={{ left: left.x, top: left.y - 22 }} onClick={p.onBack}>
          ← на полку
        </button>
      )}
    </div>
  )
}
