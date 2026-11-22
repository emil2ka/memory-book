// «Кто ведёт дневник?» — заметный выбор героя на первом экране полки (просьба Эмиля 22.11):
// две карточки-полароида «Мальчик» / «Девочка» с кадром пиксельного героя (поза joy из hero-lab).
// Показывается один раз (помнится в localStorage); потом выбор — в углу полки и в профиле.
// Выбор идёт в тот же pickPerson из App → world.setPerson: меняется и человек за столом, и герой фильма.
import { useState } from 'react'
import boyUrl from '../../assets/ui/hero_boy.webp'
import girlUrl from '../../assets/ui/hero_girl.webp'
import { HAS_GIRL, type PersonKind } from './PersonPick'
import { Sheet, Tape } from './paper'

const ASKED = 'memory-book.person-asked'

function asked(): boolean {
  try {
    return localStorage.getItem(ASKED) === '1'
  } catch {
    return false
  }
}

export function HeroPick(p: { value: PersonKind; onChange: (kind: PersonKind) => void }) {
  const [open, setOpen] = useState(() => !asked())
  if (!open) return null
  const choose = (kind: PersonKind) => {
    p.onChange(kind)
    try {
      localStorage.setItem(ASKED, '1')
    } catch {
      /* приватное окно — спросим в следующий раз */
    }
    setOpen(false)
  }
  const cards: { kind: PersonKind; label: string; img: string; tape: string; tilt: number }[] = [
    { kind: 'boy', label: 'Мальчик', img: boyUrl, tape: 'var(--greenSoft)', tilt: -2.5 },
    { kind: 'girl', label: 'Девочка', img: girlUrl, tape: 'var(--peach)', tilt: 2 },
  ]
  return (
    <div className="hero-veil" role="dialog" aria-modal="true" aria-label="Кто ведёт дневник?">
      <div className="hero-sheet">
        <Sheet edge="torn" w={560} h={420} seed="hero-pick" />
        <h1 className="hero-title">Кто ведёт дневник?</h1>
        <p className="hero-sub">этот человечек будет жить в твоих днях — потом можно поменять внизу слева</p>
        <div className="hero-cards" role="radiogroup" aria-label="герой дневника">
          {cards.map((c) => {
            const off = c.kind === 'girl' && !HAS_GIRL
            return (
              <button
                key={c.kind}
                type="button"
                role="radio"
                aria-checked={p.value === c.kind}
                className={`hero-card${p.value === c.kind ? ' on' : ''}`}
                style={{ ['--tilt' as string]: `${c.tilt}deg` }}
                onClick={() => choose(c.kind)}
                disabled={off}
                title={off ? 'скоро' : c.label}
              >
                <Sheet edge="soft" w={190} h={240} seed={`hero-${c.kind}`} />
                <Tape color={c.tape} pattern="check" w={58} angle={c.tilt * -3} className="hero-tape" />
                <img className="hero-img" src={c.img} alt="" draggable={false} />
                <span className="hero-label">{c.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
