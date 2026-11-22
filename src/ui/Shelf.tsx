// Полка-архив теперь в 3D-мире (книги кликаются в сцене: world.onShelfPick).
// Здесь — список дней для клавиатуры и экранных дикторов: не виден, пока не получит фокус (Tab),
// тогда появляется аккуратным списком в левом верхнем углу.
import type { StoredDay } from '../store'
import { spineColor } from './checks'

interface Props {
  days: StoredDay[]
  /** спрятать совсем (идёт фильм, запись) */
  hidden?: boolean
  onOpen: (day: StoredDay) => void
  onNew: () => void
}

const shortDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y.slice(2)}`
}

export function Shelf({ days, hidden, onOpen, onNew }: Props) {
  if (hidden) return null
  return (
    <nav className="shelf-keys" aria-label="Полка дней">
      <div className="shelf-keys-head small">полка · Enter открывает день</div>
      <ul>
        {days.map((d) => (
          <li key={d.id}>
            <button className="link" onClick={() => onOpen(d)} style={{ borderBottomColor: spineColor(d.script.mood) }}>
              {shortDate(d.date)} — {d.script.title}
            </button>
          </li>
        ))}
        <li>
          <button className="link" onClick={onNew}>
            + новый день
          </button>
        </li>
      </ul>
    </nav>
  )
}
