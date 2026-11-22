// Аккаунт и облако в 2D (план 15 § 2.2–2.3): бумага и чернила, как записки на столе.
//   Welcome  — первый экран: «Войти», «Создать аккаунт», «Без аккаунта»
//   CloudBadge — сверху всегда видно, где лежит день
//   AccountCard — профиль: почта, «Мои дни», «Выйти»
//   MyDays  — 2D-список дней с обложками рядом с 3D-полкой
//   MovePrompt — после входа: «перенести дни с этого устройства в облако?»
import { useState, type FormEvent } from 'react'
import type { StoredDay } from '../store'
import { spineColor } from './checks'
import { HAS_GIRL, type PersonKind } from './PersonPick'
import { Icon, PinNote, Sheet, SlipButton, Spinner, TagButton, Tape } from './paper'

type Mode = 'menu' | 'in' | 'up'

export function Welcome(p: {
  onSignIn: (email: string, password: string) => Promise<void>
  onSignUp: (email: string, password: string) => Promise<void>
  onLocal: () => void
}) {
  const [mode, setMode] = useState<Mode>('menu')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await (mode === 'up' ? p.onSignUp : p.onSignIn)(email, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'не получилось')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="acc-veil" role="dialog" aria-modal="true" aria-label="Дневник-книга: вход">
      <div className="acc-card">
        <Sheet edge="torn" w={420} h={460} seed="welcome" />
        <Tape color="var(--brick)" pattern="check" w={70} angle={-8} className="acc-tape" />
        <div className="acc-body">
          <h1 className="acc-title">
            Дневник-книга <Icon name="book" size={30} />
          </h1>
          <p className="acc-sub">пишешь пару строк о дне — книга превращает их в маленький фильм и ставит на полку</p>
          {mode === 'menu' ? (
            <div className="acc-actions">
              <TagButton seed="acc-in" onClick={() => setMode('in')}>Войти</TagButton>
              <TagButton seed="acc-up" onClick={() => setMode('up')}>Новый аккаунт</TagButton>
              {/* жюри не должно застрять на входе: «без аккаунта» — такая же бирка, как «Войти» */}
              <TagButton seed="acc-local" onClick={p.onLocal}>Попробовать без аккаунта</TagButton>
              <span className="acc-link-note">дни останутся только на этом устройстве</span>
            </div>
          ) : (
            <>
            {/* вкладки вне формы: кнопка внутри формы её отправляет */}
            <div className="tabs" role="group" aria-label="вход или новый аккаунт">
              <SlipButton on={mode === 'in'} onClick={() => setMode('in')} seed="acc-tab-in">войти</SlipButton>
              <SlipButton on={mode === 'up'} onClick={() => setMode('up')} seed="acc-tab-up">новый аккаунт</SlipButton>
            </div>
            <form className="acc-form" onSubmit={submit}>
              <label className="acc-field">
                <span>почта</span>
                <input className="field" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="acc-field">
                <span>пароль {mode === 'up' && <em>(от 6 знаков)</em>}</span>
                <input
                  className="field"
                  type="password"
                  autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && <div className="acc-error" role="alert">{error}</div>}
              <div className="acc-actions row">
                <TagButton small seed="acc-go" disabled={busy}>
                  {busy ? <Spinner size={18} /> : mode === 'up' ? 'Создать' : 'Войти'}
                </TagButton>
                <button type="button" className="acc-link" onClick={() => setMode('menu')}>назад</button>
              </div>
            </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export type SaveState = 'cloud' | 'local' | 'saving' | 'failed'

/** Где лежит день — всегда видно сверху. */
export function CloudBadge(p: { state: SaveState; email?: string; onClick?: () => void }) {
  const text = { cloud: 'сохранено в облаке ✓', local: 'только на этом устройстве', saving: 'сохраняю…', failed: 'в облако не сохранилось — повторю позже' }[p.state]
  return (
    <button className={`cloud-badge ${p.state}`} onClick={p.onClick} title={p.email ? `аккаунт: ${p.email}` : 'войти, чтобы дни были в облаке'}>
      {p.state === 'saving' && <Spinner size={14} />}
      <span>{text}</span>
    </button>
  )
}

/** Профиль: почта, «Мои дни», «Выйти» (или «Войти» без аккаунта). */
export function AccountCard(p: { email: string | null; onDays: () => void; onSignOut: () => void; onSignIn: () => void; onClose: () => void; person?: PersonKind; onPerson?: (k: PersonKind) => void }) {
  return (
    <div className="acc-pop" role="dialog" aria-label="аккаунт">
      <Sheet edge="soft" w={240} h={150} seed="acc-pop" skin="note" />
      <div className="acc-pop-body">
        {p.email ? (
          <>
            <div className="acc-mail">{p.email}</div>
            <button className="acc-link" onClick={p.onDays}>мои дни</button>
            <button className="acc-link" onClick={p.onSignOut}>выйти</button>
          </>
        ) : (
          <>
            <div className="acc-mail">без аккаунта</div>
            <button className="acc-link" onClick={p.onDays}>мои дни</button>
            <button className="acc-link" onClick={p.onSignIn}>войти — дни будут в облаке</button>
          </>
        )}
        {p.onPerson && (
          <div className="acc-person" role="radiogroup" aria-label="кто ведёт дневник">
            <span>ведёт дневник:</span>
            <SlipButton on={p.person === 'boy'} onClick={() => p.onPerson?.('boy')} seed="acc-boy">мальчик</SlipButton>
            <SlipButton on={p.person === 'girl'} onClick={() => p.onPerson?.('girl')} disabled={!HAS_GIRL} seed="acc-girl">девочка</SlipButton>
          </div>
        )}
        <button className="acc-x" onClick={p.onClose} aria-label="закрыть">×</button>
      </div>
    </div>
  )
}

const shortDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}.${m}.${y.slice(2)}`
}

/** 2D-список дней с обложками (рядом с 3D-полкой): фото дня или цвет корешка, название, дата. */
export function MyDays(p: { days: StoredDay[]; covers: Record<string, string>; inCloud: Set<string>; onOpen: (d: StoredDay) => void; onClose: () => void }) {
  return (
    <aside className="my-days" aria-label="Мои дни">
      <div className="md-head">
        <span>мои дни · {p.days.length}</span>
        <button className="acc-x" onClick={p.onClose} aria-label="закрыть">×</button>
      </div>
      {p.days.length === 0 ? (
        <div className="md-empty">пока пусто — запиши первый день</div>
      ) : (
        <ul>
          {[...p.days].reverse().map((d) => (
            <li key={d.id}>
              <button className="md-day" onClick={() => p.onOpen(d)}>
                <span className="md-cover" style={{ background: spineColor(d.script.mood), backgroundImage: p.covers[d.id] ? `url(${p.covers[d.id]})` : undefined }} />
                <span className="md-text">
                  <b>{d.script.title}</b>
                  <small>
                    {shortDate(d.date)} · {p.inCloud.has(d.id) ? 'в облаке ✓' : 'на устройстве'}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

/** После входа: перенести дни с этого устройства в облако? */
export function MovePrompt(p: { count: number; busy: boolean; onYes: () => void; onNo: () => void }) {
  return (
    <PinNote className="move-prompt" seed="move" role="dialog">
      <span>
        на этом устройстве {p.count} {p.count === 1 ? 'день' : p.count < 5 ? 'дня' : 'дней'} без облака — перенести в аккаунт?
      </span>
      <span className="mp-actions">
        <SlipButton onClick={p.onYes} disabled={p.busy} seed="mp-yes">{p.busy ? 'переношу…' : 'перенести'}</SlipButton>
        <SlipButton onClick={p.onNo} disabled={p.busy} seed="mp-no">не сейчас</SlipButton>
      </span>
    </PinNote>
  )
}
