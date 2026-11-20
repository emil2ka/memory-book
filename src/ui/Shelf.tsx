// Полка-архив: корешки книг с датой и названием; цвет — от настроения, толщина — от длины записи.
import type { StoredDay } from '../store'
import { spineColor, spineWidth } from './checks'

interface Props {
  days: StoredDay[]
  /** спрятать (плавно), пока идёт фильм */
  hidden?: boolean
  onOpen: (day: StoredDay) => void
  onNew: () => void
}

const shortDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y.slice(2)}`
}

export function Shelf({ days, hidden, onOpen, onNew }: Props) {
  return (
    <nav className={`shelf${hidden ? ' hidden' : ''}`} aria-label="Полка дней" aria-hidden={hidden || undefined}>
      <div className="spines">
        {days.map((d, i) => (
          <button
            key={d.id}
            className="spine"
            style={{ background: spineColor(d.script.mood), width: spineWidth(d.text.length), height: 118 + ((i * 37) % 4) * 8 }}
            onClick={() => onOpen(d)}
            title={`${d.date} — ${d.script.title}`}
          >
            <span className="spine-title">{d.script.title}</span>
            <span className="spine-date">{shortDate(d.date)}</span>
          </button>
        ))}
        <button className="spine new" onClick={onNew} title="Новый день">
          <span className="spine-title">новый день</span>
          <span className="spine-date">+</span>
        </button>
      </div>
      <div className="plank" />
    </nav>
  )
}
