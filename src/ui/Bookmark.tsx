// Закладка «Почему так» после фильма: название, три причины, действия.
import type { DayScript } from '../types/script'
import { spineColor } from './checks'

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
  return (
    <aside className="bookmark" style={{ ['--ribbon' as string]: spineColor(p.script.mood) }} aria-label="Почему так">
      <div className="ribbon-top" />
      <h1 className="bm-title">{p.script.title}</h1>
      <h2 className="bm-head">Почему так</h2>
      <ul className="bm-why">
        {p.script.why.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
      {p.source === 'fallback' && <div className="small">сценарий собран без сети, по словарю</div>}
      <div className="bm-actions">
        {p.canSave && (
          <button className="link" onClick={p.onSave} disabled={p.saved}>
            {p.saved ? 'сохранено ✓' : 'Сохранить'}
          </button>
        )}
        <button className="link" onClick={p.onDownload}>Скачать папку дня</button>
        <button className="link" onClick={p.onReplay}>Ещё раз</button>
        {p.canDelete && <button className="link danger" onClick={p.onDelete}>Удалить</button>}
        {p.onEdit && <button className="link" onClick={p.onEdit}>Править запись</button>}
        <button className="link" onClick={p.onShelf}>На полку</button>
        <button className="link" onClick={p.onNew}>Новый день</button>
      </div>
      {p.status && <div className="small status">{p.status}</div>}
    </aside>
  )
}
