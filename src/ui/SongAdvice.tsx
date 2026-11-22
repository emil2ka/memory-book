// Записка на кассете «ты не поставил песню — этот день звучит так» (план 14 § 2, поправка Эмиля 22.11:
// только настоящие песни, ИИ их называет, но не создаёт). Появляется, когда запись написана, а песни нет.
// Клик по песне — режим «ссылка» с названием, исполнителем и ручками; «послушать» — поиск на YouTube.
// Ничего не выбрал — ничего не блокирует.
import { PinNote } from './paper'

export interface SongPick {
  title: string
  artist: string
  why?: string
  /** 0..1 */
  tempo: number
  /** 0..1 */
  energy: number
  /** проверенный id ролика YouTube (если есть) */
  yt?: string
}

interface Props {
  /** loading — подбираем; ready — есть песни */
  state: 'loading' | 'ready'
  songs: SongPick[]
  onSong: (s: SongPick) => void
  disabled?: boolean
  className?: string
}

/** «медленно, тихо» — словами для строки песни. */
export function feelWords(tempo: number, energy: number): string {
  const t = tempo < 0.34 ? 'медленно' : tempo > 0.66 ? 'быстро' : 'средне'
  const e = energy < 0.34 ? 'тихо' : energy > 0.66 ? 'радостно' : ''
  return [t, e].filter(Boolean).join(', ')
}

/** Поиск песни на YouTube (новая вкладка): ссылку на саму песню мы не знаем и не храним. */
export const listenUrl = (artist: string | undefined, title: string | undefined) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent([artist, title].filter(Boolean).join(' '))}`

export function SongAdvice(p: Props) {
  return (
    <PinNote className={`song-advice${p.className ? ' ' + p.className : ''}`} seed="song-advice">
      {p.state === 'loading' ? (
        <span className="sa-wait">подбираю песню…</span>
      ) : (
        <>
          <span className="sa-head">ты не поставил песню — этот день звучит так:</span>
          <ul className="sa-list">
            {p.songs.slice(0, 3).map((s, i) => (
              <li key={i}>
                <button className="sa-song" onClick={() => p.onSong(s)} disabled={p.disabled}>
                  ▸ {s.artist ? `${s.artist} — ` : ''}«{s.title}» <span className="sa-feel">· {feelWords(s.tempo, s.energy)}</span>
                </button>
                <a className="sa-listen" href={listenUrl(s.artist, s.title)} target="_blank" rel="noreferrer noopener">
                  послушать
                </a>
                {s.why && <span className="sa-why" title={s.why}>{s.why}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </PinNote>
  )
}
