// Экран загрузки в стиле «канцелярия»: книга, чернильная полоска и подписи, что сейчас готовится.
// Держится, пока не загрузились картинки интерфейса, шрифты и 3D-сцена, — потом плавно уходит.
import './loader.css'

const STEPS = [
  { at: 0, text: 'раскладываю бумагу…' },
  { at: 0.3, text: 'точу карандаш…' },
  { at: 0.5, text: 'ставлю книгу на стол…' },
  { at: 0.8, text: 'зажигаю лампу…' },
  { at: 0.97, text: 'почти готово' },
]

export function Loader({ progress, done }: { progress: number; done: boolean }) {
  const k = Math.max(0, Math.min(1, progress))
  const step = [...STEPS].reverse().find((s) => k >= s.at) ?? STEPS[0]
  return (
    <div className={`loader${done ? ' gone' : ''}`} role="progressbar" aria-label="Загрузка" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(k * 100)}>
      <div className="ld-card">
        <div className="ld-book" aria-hidden="true">
          <span className="ld-page ld-left" />
          <span className="ld-page ld-right" />
          <span className="ld-flip" />
        </div>
        <h1 className="ld-title">Дневник-книга</h1>
        <div className="ld-bar" aria-hidden="true">
          <span style={{ width: `${Math.round(k * 100)}%` }} />
        </div>
        <div className="ld-step">
          {step.text} <b>{Math.round(k * 100)}%</b>
        </div>
      </div>
    </div>
  )
}
