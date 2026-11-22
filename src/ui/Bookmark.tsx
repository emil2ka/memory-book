// Закладка «Почему так» после фильма: название, три причины, действия.
// На телефоне (узкий вертикальный экран) — шторка снизу: фильм остаётся виден сверху; ручка сворачивает её до названия.
import { useState } from 'react'
import type { DayScript } from '../types/script'
import { spineColor } from './checks'
import { CardButton, Clip, FlagButton, Icon, PinNote, Sheet, Sprig, Squiggle, Tassel, TagButton } from './paper'

interface Props {
  script: DayScript
  source: 'llm' | 'fallback'
  saved: boolean
  canSave: boolean
  canDelete: boolean
  onSave: () => void
  onDownload: () => void
  onReplay: () => void
  onDelete: () => void
  onShelf: () => void
  onNew: () => void
  /** вернуться к записи и поправить (только для несохранённого дня) */
  onEdit?: () => void
  status?: string
}

export function Bookmark(p: Props) {
  const [folded, setFolded] = useState(false)
  return (
    <aside className={`bookmark${folded ? ' folded' : ''}`} style={{ ['--ribbon' as string]: spineColor(p.script.mood) }} aria-label="Почему так">
      <div className="bm-paper">
        <button className="bm-handle" onClick={() => setFolded((f) => !f)} aria-expanded={!folded} aria-label={folded ? 'Открыть «Почему так»' : 'Свернуть, чтобы видеть кадр'}>
          <span className="bm-grip" aria-hidden />
        </button>
        <Sheet shape="bookmark" edge="soft" w={300} h={640} seed="bookmark" />
        <span className="bm-dash" aria-hidden />
        <Clip className="bm-clip" />
        <Tassel className="bm-tassel" />
        <div className="bm-content">
          <h1 className="bm-title">{p.script.title}</h1>
          <h2 className="bm-head">
            Почему так
            <Squiggle w={110} />
          </h2>
          <ul className="bm-why">
            {p.script.why.map((w, i) => (
              <li key={i}>
                <Icon name="check" size={16} className="bm-check" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
          {p.source === 'fallback' && <div className="bm-note">сценарий собран без сети, по словарю</div>}
          <div className="bm-cards">
            <CardButton icon="replay" label="Ещё раз" tape={0} onClick={p.onReplay} />
            <CardButton icon="download" label="Скачать" tape={1} onClick={p.onDownload} ariaLabel="Скачать папку дня" />
            {p.canDelete && <CardButton icon="trash" label="Удалить" tape={2} onClick={p.onDelete} className="danger" />}
            {p.onEdit && <CardButton icon="pencil" label="Править" tape={3} onClick={p.onEdit} ariaLabel="Править запись" />}
            {p.canSave && (
              <CardButton icon={p.saved ? 'check' : 'save'} label={p.saved ? 'Сохранено' : 'Сохранить'} tape={4} onClick={p.onSave} disabled={p.saved} />
            )}
          </div>
          <div className="bm-nav">
            <FlagButton onClick={p.onShelf} seed="bm-shelf">← На полку</FlagButton>
            <TagButton small onClick={p.onNew} seed="bm-new">Новый день</TagButton>
          </div>
          <Sprig size={40} className="bm-sprig a" />
          <Sprig size={30} flip className="bm-sprig b" />
        </div>
      </div>
      {p.status && (
        <PinNote className="bm-status" seed="bm-status">
          {p.status}
        </PinNote>
      )}
    </aside>
  )
}
