// Бирка «♪ музыка» — включить или выключить тихий фон (src/audio/ambient.ts). Стиль — бумажная «канцелярия».
import { useEffect, useState } from 'react'
import { ambient } from '../audio/ambient'
import './music.css'

export function MusicToggle() {
  const [on, setOn] = useState(ambient.enabled)
  useEffect(() => ambient.onChange(setOn), [])
  return (
    <button
      className={`music-toggle${on ? ' on' : ''}`}
      onClick={() => ambient.setEnabled(!on)}
      aria-pressed={on}
      title={on ? 'выключить фоновую музыку' : 'включить фоновую музыку'}
    >
      <span className="mt-note">♪</span> {on ? 'музыка' : 'без музыки'}
    </button>
  )
}
