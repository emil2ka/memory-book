// Тихий выбор на главном экране: кто пишет за столом — он или она.
// Выбор помнится в localStorage. «Она» доступна, только когда в assets/models/world/ есть girl.glb.
import { PALETTE, css } from '../scene/palette'
import { Sheet } from './paper'

export type PersonKind = 'boy' | 'girl'

const girlFile = import.meta.glob('../../assets/models/world/girl.glb', { query: '?url', import: 'default', eager: true })
export const HAS_GIRL = Object.keys(girlFile).length > 0

const KEY = 'memory-book.person'

export function loadPerson(): PersonKind {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'girl' && HAS_GIRL) return 'girl'
  } catch {
    /* приватное окно — по умолчанию он */
  }
  return 'boy'
}

export function savePerson(kind: PersonKind) {
  try {
    localStorage.setItem(KEY, kind)
  } catch {
    /* не страшно */
  }
}

// Пиксельные головы 10×10: короткая стрижка и косички. Цвета из палитры стиля.
const HAIR = css(PALETTE.brownDark)
const SKIN = css(PALETTE.skin)
const INK = css(PALETTE.ink)

function Boy() {
  return (
    <svg viewBox="0 0 10 10" width="26" height="26" shapeRendering="crispEdges" aria-hidden>
      <rect x="2" y="1" width="6" height="2" fill={HAIR} />
      <rect x="2" y="3" width="6" height="5" fill={SKIN} />
      <rect x="2" y="3" width="1" height="2" fill={HAIR} />
      <rect x="7" y="3" width="1" height="2" fill={HAIR} />
      <rect x="4" y="5" width="1" height="1" fill={INK} />
      <rect x="6" y="5" width="1" height="1" fill={INK} />
      <rect x="3" y="8" width="4" height="1" fill={SKIN} />
    </svg>
  )
}

function Girl() {
  return (
    <svg viewBox="0 0 10 10" width="26" height="26" shapeRendering="crispEdges" aria-hidden>
      <rect x="2" y="1" width="6" height="2" fill={HAIR} />
      <rect x="2" y="3" width="6" height="5" fill={SKIN} />
      <rect x="2" y="3" width="1" height="3" fill={HAIR} />
      <rect x="7" y="3" width="1" height="3" fill={HAIR} />
      <rect x="0" y="5" width="2" height="3" fill={HAIR} />
      <rect x="8" y="5" width="2" height="3" fill={HAIR} />
      <rect x="4" y="5" width="1" height="1" fill={INK} />
      <rect x="6" y="5" width="1" height="1" fill={INK} />
      <rect x="3" y="8" width="4" height="1" fill={SKIN} />
    </svg>
  )
}

interface Props {
  value: PersonKind
  onChange: (kind: PersonKind) => void
}

export function PersonPick({ value, onChange }: Props) {
  return (
    <div className="person-pick" role="radiogroup" aria-label="кто пишет">
      <Sheet edge="torn" w={236} h={84} seed="person-pick" />
      <span className="pp-label">кто ведёт дневник</span>
      <span className="pp-track">
        <button role="radio" aria-checked={value === 'boy'} aria-label="мальчик" title="мальчик" className={value === 'boy' ? 'on' : ''} onClick={() => onChange('boy')}>
          <Boy />
          мальчик
        </button>
        <button
          role="radio"
          aria-checked={value === 'girl'}
          aria-label="девочка"
          title={HAS_GIRL ? 'девочка' : 'девочка — скоро'}
          className={value === 'girl' ? 'on' : ''}
          disabled={!HAS_GIRL}
          onClick={() => onChange('girl')}
        >
          <Girl />
          девочка
        </button>
      </span>
    </div>
  )
}
