// Навигация по дням (Эмиль, 22.11): «Мои дни» — календарь месяца с корешками дней, поиск и список;
// после фильма — бирки «прошлый день / следующий день» и стрелки ← → на клавиатуре. Стиль — бумажная «канцелярия».
import { useEffect, useMemo, useState } from 'react'
import type { StoredDay } from '../store'
import './daynav.css'

const MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_OF = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const WEEK = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

/** Цвет корешка по настроению дня: тёплый — охра и кирпич, холодный — синий, напряжённый — тёмный. */
export function moodColor(d: StoredDay): string {
  const m = d.script.mood
  if (m.tension > 0.45) return '#3d3f5a'
  if (m.warmth > 0.3) return m.energy > 0.3 ? '#c4553f' : '#d39a2c'
  if (m.warmth < -0.2) return '#3f6aa8'
  return m.energy > 0.3 ? '#4f8a5b' : '#8a7a63'
}

const byDate = (a: StoredDay, b: StoredDay) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt
const dayLabel = (d: string) => {
  const [, m, day] = d.split('-').map(Number)
  return `${day} ${MONTHS_OF[(m || 1) - 1]}`
}

interface DaysProps {
  days: StoredDay[]
  covers: Record<string, string>
  inCloud: Set<string>
  onOpen: (d: StoredDay) => void
  onClose: () => void
}

/** «Мои дни»: календарь месяца, поиск и список. */
export function DaysBook(p: DaysProps) {
  const sorted = useMemo(() => [...p.days].sort(byDate), [p.days])
  const last = sorted[sorted.length - 1]
  const [view, setView] = useState<'cal' | 'list'>('cal')
  const [q, setQ] = useState('')
  const [month, setMonth] = useState(() => (last?.date ?? new Date().toISOString()).slice(0, 7))
  const [y, m] = month.split('-').map(Number)
  const shift = (k: number) => {
    const d = new Date(y, m - 1 + k, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const byDay = useMemo(() => {
    const map = new Map<string, StoredDay[]>()
    for (const d of sorted) map.set(d.date, [...(map.get(d.date) ?? []), d])
    return map
  }, [sorted])
  const found = q.trim() ? sorted.filter((d) => `${d.script.title} ${d.text}`.toLowerCase().includes(q.trim().toLowerCase())) : null
  const inMonth = sorted.filter((d) => d.date.startsWith(month))
  // сетка месяца с понедельника
  const first = new Date(y, m - 1, 1)
  const lead = (first.getDay() + 6) % 7
  const count = new Date(y, m, 0).getDate()
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)]

  const row = (d: StoredDay) => (
    <li key={d.id}>
      <button className="dn-day" onClick={() => p.onOpen(d)}>
        <span className="dn-cover" style={{ background: moodColor(d), backgroundImage: p.covers[d.id] ? `url(${p.covers[d.id]})` : undefined }} />
        <span className="dn-text">
          <b>{d.script.title}</b>
          <small>
            {dayLabel(d.date)} · {p.inCloud.has(d.id) ? 'в облаке ✓' : 'на устройстве'}
          </small>
        </span>
      </button>
    </li>
  )

  return (
    <aside className="daysbook" aria-label="Мои дни">
      <div className="dn-head">
        <span>мои дни · {p.days.length}</span>
        <button className="dn-x" onClick={p.onClose} aria-label="закрыть">×</button>
      </div>
      <div className="dn-tools">
        <input className="dn-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="найти день: снег, бабушка…" aria-label="Поиск по дням" />
        <div className="dn-tabs" role="tablist">
          <button role="tab" aria-selected={view === 'cal'} className={view === 'cal' ? 'on' : ''} onClick={() => setView('cal')}>
            календарь
          </button>
          <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>
            список
          </button>
        </div>
      </div>

      {found ? (
        found.length ? <ul className="dn-list">{[...found].reverse().map(row)}</ul> : <div className="dn-empty">ничего не нашлось</div>
      ) : p.days.length === 0 ? (
        <div className="dn-empty">пока пусто — запиши первый день</div>
      ) : view === 'list' ? (
        <ul className="dn-list">{[...sorted].reverse().map(row)}</ul>
      ) : (
        <>
          <div className="dn-month">
            <button onClick={() => shift(-1)} aria-label="прошлый месяц">‹</button>
            <span>
              {MONTHS[m - 1]} {y}
            </span>
            <button onClick={() => shift(1)} aria-label="следующий месяц">›</button>
          </div>
          <div className="dn-grid">
            {WEEK.map((w) => (
              <span key={w} className="dn-wd">
                {w}
              </span>
            ))}
            {cells.map((n, i) => {
              if (n === null) return <span key={`e${i}`} />
              const key = `${month}-${String(n).padStart(2, '0')}`
              const list = byDay.get(key) ?? []
              const d = list[list.length - 1]
              return d ? (
                <button key={key} className={`dn-cell has${key === todayKey ? ' today' : ''}`} onClick={() => p.onOpen(d)} title={list.map((x) => x.script.title).join(' · ')}>
                  <span className="dn-n">{n}</span>
                  <span className="dn-spines">
                    {list.slice(-3).map((x) => (
                      <i key={x.id} style={{ background: moodColor(x) }} />
                    ))}
                  </span>
                </button>
              ) : (
                <span key={key} className={`dn-cell${key === todayKey ? ' today' : ''}`}>
                  <span className="dn-n">{n}</span>
                </span>
              )
            })}
          </div>
          {inMonth.length ? <ul className="dn-list">{[...inMonth].reverse().map(row)}</ul> : <div className="dn-empty">в этом месяце записей нет</div>}
        </>
      )}
    </aside>
  )
}

/** После фильма: бирки «прошлый день / следующий день» и стрелки ← → на клавиатуре. */
export function DayPager(p: { days: StoredDay[]; currentId: string; onOpen: (d: StoredDay) => void }) {
  const sorted = useMemo(() => [...p.days].sort(byDate), [p.days])
  const i = sorted.findIndex((d) => d.id === p.currentId)
  const prev = i > 0 ? sorted[i - 1] : null
  const next = i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft' && prev) p.onOpen(prev)
      if (e.key === 'ArrowRight' && next) p.onOpen(next)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [prev, next, p])
  if (i < 0 || (!prev && !next)) return null
  return (
    <nav className="day-pager" aria-label="Листать дни">
      {prev ? (
        <button className="dp-tag dp-prev" onClick={() => p.onOpen(prev)} title="←">
          <small>‹ прошлый день · {dayLabel(prev.date)}</small>
          <b>{prev.script.title}</b>
        </button>
      ) : (
        <span />
      )}
      {next ? (
        <button className="dp-tag dp-next" onClick={() => p.onOpen(next)} title="→">
          <small>{dayLabel(next.date)} · следующий день ›</small>
          <b>{next.script.title}</b>
        </button>
      ) : (
        <span />
      )}
    </nav>
  )
}
