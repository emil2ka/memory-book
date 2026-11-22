// Витрина интерфейса «канцелярия» (?lab=ui): все элементы на столе, как на референсе
// assets/_raw/ui/ui_A_stationery.jpg. Нижний ряд — состояния бирки: обычное, наведение, нажато.
import { useEffect, useState } from 'react'
import { PALETTE, css } from '../scene/palette'
import { demoDays } from '../store'
import { Bookmark } from '../ui/Bookmark'
import { Cassette, type SongDraft } from '../ui/Cassette'
import { CardButton, FlagButton, Icon, PinNote, SealButton, Sheet, SlipButton, Spinner, TagButton, Tape } from '../ui/paper'
import { PersonPick, type PersonKind } from '../ui/PersonPick'
import '../app.css'
import './uilab.css'

export default function UiLab() {
  const [person, setPerson] = useState<PersonKind>('boy')
  const [song, setSong] = useState<SongDraft>({ kind: 'file', title: 'Песня дня', bpm: 92 })
  useEffect(() => {
    const root = document.documentElement
    for (const [k, v] of Object.entries(PALETTE)) root.style.setProperty(`--${k}`, css(v))
  }, [])
  const day = demoDays[0]
  return (
    <div className="ui-lab">
      <div className="ui-lab-title">
        <Sheet edge="torn" w={520} h={70} seed="lab-title" />
        <Tape color="var(--greenSoft)" pattern="check" w={60} angle={-8} className="lab-title-tape" />
        <span>Дневник-книга</span>
        <Icon name="book" size={34} />
      </div>
      <div className="ui-lab-grid">
        <section className="cell tag-cell">
          <TagButton seed="cta">Записать день</TagButton>
          <div className="cards-row">
            <CardButton icon="replay" label="Ещё раз" tape={0} />
            <CardButton icon="download" label="Скачать" tape={1} />
            <CardButton icon="trash" label="Удалить" tape={2} className="danger" />
            <CardButton icon="pencil" label="Править" tape={3} />
          </div>
        </section>
        <section className="cell seal-cell">
          <SealButton style={{ width: 190, height: 238 }} />
        </section>
        <section className="cell flag-cell">
          <FlagButton seed="back">← На полку</FlagButton>
          <div style={{ position: 'relative', height: 110 }}>
            <PersonPick value={person} onChange={setPerson} />
          </div>
        </section>
        <section className="cell bm-cell">
          <Bookmark
            script={day.script}
            source="llm"
            saved={false}
            canSave
            canDelete
            onSave={() => {}}
            onDownload={() => {}}
            onReplay={() => {}}
            onDelete={() => {}}
            onShelf={() => {}}
            onNew={() => {}}
            onEdit={() => {}}
          />
        </section>
        <section className="cell cass-cell">
          <Cassette song={song} onSong={setSong} need={false} disabled={false} style={{ position: 'relative' }} />
        </section>
        <section className="cell note-cell">
          <PinNote spinner seed="busy">проявляю фото…</PinNote>
          <PinNote spinner seed="busy2">читаю запись…</PinNote>
          <SlipButton seed="ok">ок</SlipButton>
        </section>
        <section className="cell photo-cell">
          <span className="photo-card" style={{ width: 300, height: 170, position: 'relative', left: 'auto', transform: 'rotate(1.2deg)' }}>
            <Sheet edge="torn" w={300} h={170} seed="photo-card" />
            <Tape color="var(--brick)" pattern="check" w={58} angle={-12} className="photo-tape" />
            <span className="photo-dash" aria-hidden />
            <Icon name="photo" size={40} />
            <span className="drop-label">перетащи сюда 1–5 фото</span>
            <span className="drop-sub">или нажми</span>
          </span>
          <Spinner size={30} />
        </section>
        <section className="cell states-cell">
          {(['', 'is-hover', 'is-active'] as const).map((st, i) => (
            <div key={i} className="state">
              <span className="state-name">{['обычное', 'наведение', 'нажато'][i]}</span>
              <TagButton seed="cta" className={st}>Записать день</TagButton>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
