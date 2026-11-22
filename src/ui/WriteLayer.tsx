// Режим записи: DOM-слой, выровненный по страницам книги. Сам текст рисует сцена,
// textarea прозрачная — виден только курсор.
import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import { MAX_TEXT, type Need } from './checks'
import { Cassette, type SongDraft } from './Cassette'
import type { SongPick } from './SongAdvice'
import { isImageFile } from '../photos/files'
import { CardButton, FlagButton, Icon, PinNote, SealButton, Sheet, Spinner, Tape } from './paper'

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
  /** записка «ты не поставил песню» (песни от ИИ), null — нет */
  songAdvice?: { state: 'loading' | 'ready'; songs: SongPick[] } | null
  onSong: (s: SongDraft) => void
  need: Need[]
  busy: boolean
  /** что сейчас делает режиссёр — вместо «собираю…» */
  busyText?: string
  photoBusy: boolean
  /** что не так с фото (HEIC, не открылось, больше 5) — показываем под карточкой */
  photoNote?: string
  /** кегль книги в долях ширины страницы (World.pageFontFrac): поле совпадает с текстом на странице */
  pageFont?: number
  /** что увидел ИИ на последнем снимке: «на фото: кофейня, подруга, какао» (карточка снимка, /api/photo) */
  photoSeen?: string
  /** песня выбрана (файл, ссылка или песня из записки): без неё «Собрать день» заперта на вид, клик показывает, чего не хватает */
  songReady?: boolean
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
  const taRef = useRef<HTMLTextAreaElement>(null)
  const ready = !!p.rects
  // слой появился — курсор в конец того, что уже успели набрать
  useEffect(() => {
    const ta = taRef.current
    if (!ready || !ta || p.busy) return
    ta.focus()
    ta.setSelectionRange(ta.value.length, ta.value.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])
  if (!p.rects) return null
  const { left, right, scale } = p.rects
  // Шрифт страницы: 14 px текстуры на 160 px ширины страницы (см. Book.ts), в CSS-пикселях.
  // кегль как у книги (она мельчит ступенями, пока текст не влезет); не мельче 9 px на экране
  const fontPx = Math.max(9, Math.round((p.pageFont ?? 14 / 160) * left.w))
  const needs = (n: Need) => (p.need.includes(n) ? ' need' : '')
  // Кассета справа от книги; не помещается — под правой страницей (узкий экран, телефон).
  const vw = typeof innerWidth === 'number' ? innerWidth : 1280
  const vh = typeof innerHeight === 'number' ? innerHeight : 800
  // размеры кассеты «канцелярии» (нарисованный корпус 300 px + бумажка с выбором), с поправкой на мелкий масштаб телефона
  const uiScale = vh <= 560 || vw <= 600 ? 0.74 : 1
  const cassW = Math.round(300 * uiScale)
  const cassH = Math.round(300 * uiScale)
  const rightRoom = vw - (right.x + right.w)
  const roomBelow = vh - (right.y + right.h + 14)
  // справа от книги или под ней; места нет нигде (телефон, запись глазами человека) — значок в правом верхнем углу
  const cassCompact = rightRoom < cassW + 24 && roomBelow < cassH
  // свёрнутая кассета — та же картинка в правом верхнем углу, по высоте свободного места над книгой (корпус 720×439)
  const cassChipW = Math.round(Math.max(150, Math.min(cassW, (right.y - 14) * (720 / 439))))
  const cassStyle: CSSProperties = cassCompact
    ? { right: 8, top: 8, width: cassChipW }
    : rightRoom >= cassW + 24
      ? { left: right.x + right.w + Math.min(18 * Math.max(1, scale / 2), rightRoom - cassW - 12), top: Math.max(8, Math.min(right.y + right.h * 0.3, vh - cassH - 8)) }
      : { left: 0, top: Math.min(right.y + right.h + 28, vh - cassH - 8) } // ниже строки-подсказки под страницей
  const cassBelow = !cassCompact && rightRoom < cassW + 24
  // Сургучная печать «Собрать день» — на правом нижнем углу правой страницы; книга шире экрана — прижимаем к краю.
  const small = vh < 520 || vw < 600
  const seal = Math.round(Math.max(small ? 72 : 100, Math.min(right.w * 0.24, small ? 100 : 160)))
  const sealH = Math.round(seal * 1.25)
  const sealX = Math.min(right.x + right.w - seal * 0.72, vw - seal - 6)
  const sealY = Math.min(right.y + right.h - seal * 0.62, vh - sealH - 4)
  // кассета под книгой — левее печати, чтобы ленты печати её не задели
  if (cassBelow) cassStyle.left = Math.max(8, Math.min(vw - cassW - 10, sealX - cassW - 16))
  // кассета с запиской песен выше расчётной: не уходит за нижний край экрана, а прокручивается внутри (телефон вертикально)
  if (!cassCompact && typeof cassStyle.top === 'number') {
    cassStyle.maxHeight = Math.max(160, vh - cassStyle.top - 8)
    cassStyle.overflowY = 'auto'
    cassStyle.overscrollBehavior = 'contain'
  }
  const hintRightEdge = cassBelow ? Math.min(sealX - 10, (cassStyle.left as number) - 8) : sealX - 10
  // карточка для фото — в верхней трети правой страницы (ниже наискось лежит рука с ручкой)
  const cardW = Math.round(Math.min(right.w * 0.62, 300))
  // высота не меньше расчётной, а растёт по содержимому (min-height): подпись на узкой карточке может уйти в три строки
  const labelPx = cardW < 170 ? 15 : vw <= 600 ? 17 : 23 * uiScale
  // узкая карточка (телефон в портрете): без «или нажми», иконка и подпись мельче — иначе карточка дорастает до печати
  const narrowCard = cardW < 170
  const iconPx = narrowCard ? 18 : small ? 24 : 34
  const needH = iconPx + (cardW < 230 ? 2 : 1) * labelPx * 1.08 + (narrowCard ? 0 : 11 * uiScale * 1.3) + 34
  const cardH = Math.round(Math.min(Math.max(needH, Math.min(right.h * 0.36, 170)), right.h * 0.6))
  // свёрнутая кассета в правом верхнем углу: карточка не должна её задевать
  let cardTop = Math.round(right.h * 0.12)
  if (cassCompact) {
    const chipBottom = 8 + cassChipW * (439 / 720)
    const cardLeft = right.x + (right.w - cardW) / 2
    if (cardLeft + cardW > vw - 8 - cassChipW - 6 && right.y + cardTop < chipBottom + 10) cardTop = Math.round(chipBottom + 10 - right.y)
    // раскрытая кассета (с запиской песен) не закрывает карточку фото: встаёт правее неё, но не уже 200 px
    ;(cassStyle as Record<string, string | number>)['--pop-w'] = `${Math.round(Math.max(200, Math.min(cassChipW, vw - 8 - (cardLeft + cardW) - 10)))}px`
  }
  const leftX = Math.max(8, left.x)
  const padY = Math.round(left.h * 0.06)
  const padX = Math.round(left.w * 0.08)

  const take = (list: FileList | null) => {
    const files = [...(list ?? [])].filter(isImageFile)
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
        ref={taRef}
        className={`page-text${needs('text')}${p.sceneCaret ? ' scene-caret' : ''}`}
        onSelect={(e) => p.onCaret?.((e.target as HTMLTextAreaElement).selectionStart)}
        onBlur={() => p.onCaret?.(null)}
        style={{ ...box(left), fontSize: fontPx, lineHeight: 1.35, padding: `${padY}px ${padX}px` }}
        value={p.text}
        onChange={(e) => {
          p.onCaret?.(e.target.selectionStart)
          p.onText(e.target.value)
        }}
        placeholder=""
        spellCheck={false}
        autoFocus
        maxLength={MAX_TEXT}
        aria-label="Текст дня"
        disabled={p.busy}
      />
      {/* подсказку на пустой странице рисует сцена прямо на листе (Book.setPlaceholder) — она в перспективе страницы */}
      <div className="hint" style={{ left: leftX, top: Math.min(left.y + left.h + 6, vh - 22), width: left.x + left.w - leftX }}>
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
        tabIndex={p.photoCount < MAX_PHOTOS && !p.busy ? 0 : -1}
        onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !p.busy && p.photoCount < MAX_PHOTOS) { e.preventDefault(); fileRef.current?.click() } }}
        aria-label="Добавить фото"
      >
        {p.photoCount === 0 && (
          <span className={`photo-card${narrowCard ? ' narrow' : ''}`} style={{ width: cardW, minHeight: cardH, top: cardTop }}>
            <Sheet edge="torn" w={cardW} h={cardH} seed="photo-card" />
            <Tape color="var(--brick)" pattern="check" w={58} angle={-12} className="photo-tape" />
            <span className="photo-dash" aria-hidden />
            {p.photoBusy ? <Spinner size={30} /> : <Icon name="photo" size={iconPx} />}
            <span className="drop-label">{p.photoBusy ? 'проявляю фото…' : 'перетащи сюда 1–5 фото'}</span>
            {!p.photoBusy && !narrowCard && <span className="drop-sub">или нажми</span>}
          </span>
        )}
        <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => { take(e.target.files); e.target.value = '' }} />
      </div>
      <div className="hint right" style={{ left: right.x, top: Math.min(right.y + right.h + 8, vh - 62), width: Math.max(0, Math.min(right.w, hintRightEdge - right.x)) }}>
        {p.photoBusy && p.photoCount > 0 ? (
          <span>проявляю фото…</span>
        ) : p.photoNote && !p.photoCount ? (
          <span className="photo-note" role="status">{p.photoNote}</span>
        ) : p.photoCount ? (
          <>
            {p.photoNote && <span className="photo-note" role="status">{p.photoNote}</span>}
            {p.photoSeen && <span className="photo-seen" role="status">{p.photoSeen}</span>}
            <span>фото {p.photoCount}/{MAX_PHOTOS}</span>
            {p.photoCount < MAX_PHOTOS && <CardButton mini icon="plus" label="ещё" tape={0} onClick={() => fileRef.current?.click()} disabled={p.busy} ariaLabel="добавить ещё фото" />}
            <CardButton mini icon="minus" label="убрать" tape={1} onClick={p.onRemoveLastPhoto} disabled={p.busy} ariaLabel="убрать последнее фото" />
          </>
        ) : p.need.includes('photos') ? (
          <span>нужно хотя бы одно фото</span>
        ) : null}
        {p.songReady === false && !p.busy && (
          <span className={`song-hint${p.need.includes('song') ? ' warn' : ''}`} role="status">♪ выбери песню дня</span>
        )}
      </div>

      <Cassette
        style={cassStyle}
        compact={cassCompact}
        song={p.song}
        advice={p.songAdvice}
        onSong={p.onSong}
        need={p.need.includes('song')}
        disabled={p.busy}
      />

      <SealButton
        className={`write-seal${p.songReady === false && !p.busy ? ' locked' : ''}`}
        style={{ left: sealX, top: sealY, width: seal, height: sealH }}
        onClick={p.onCollect}
        disabled={p.busy}
        busy={p.busy}
        ariaLabel={p.songReady === false && !p.busy ? 'Собрать день — сначала выбери песню дня' : 'Собрать день'}
        title={p.songReady === false && !p.busy ? 'сначала выбери песню дня' : 'Собрать'}
      />
      {p.busy && (
        <PinNote className="busy-note" spinner seed="busy" style={{ right: Math.max(6, vw - sealX + 6), top: Math.max(6, sealY + seal * 0.05) }}>
          {p.busyText ?? 'собираю…'}
        </PinNote>
      )}

      {!p.busy && (
        <FlagButton className="back" style={{ left: leftX, top: Math.max(8, left.y - 50) }} onClick={p.onBack} seed="back">
          ← На полку
        </FlagButton>
      )}
    </div>
  )
}
