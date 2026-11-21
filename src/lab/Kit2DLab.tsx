// Витрина картинок предметов: ?lab=kit (3D-кит — &mode=3d) (&sheet=1 — лист без интерфейса, &src=<json> — дорисованные).
// Картинки — SVG из assets/kit2d (рисует Claude), каждая проходит validateSvg.
import { useEffect, useMemo, useState } from 'react'
import { CATEGORY_RU, KIT_LIBRARY, KIT_PACKS, categoryOf, kitById, type Category } from '../kit/library'
import { svgDataUrl, validateSvg } from '../kit/svg'
import { PALETTE, css } from '../scene/palette'
import './lab.css'

const files = import.meta.glob('../../assets/kit2d/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const params = new URLSearchParams(location.search)
const SHEET = params.get('sheet') === '1'
const COMPACT = params.get('compact') === '1'
const PACK = params.get('pack')
const packIds = PACK ? new Set(KIT_PACKS[/^\d+$/.test(PACK) ? `pack${PACK}` : PACK] ?? []) : null

interface Pic { id: string; ru: string; cat: string; url: string | null; errors: string[]; by: string }

export default function Kit2DLab() {
  const [extra, setExtra] = useState<Pic[]>([])
  const [cat, setCat] = useState(params.get('cat') ?? 'all')
  useEffect(() => {
    for (const [k, v] of Object.entries(PALETTE)) document.documentElement.style.setProperty(`--${k}`, css(v))
    document.title = 'Картинки предметов'
    const src = params.get('src')
    if (src)
      fetch(src)
        .then((r) => r.json())
        .then((list: { id: string; ru: string; svg: string }[]) =>
          setExtra(list.map((m) => { const r = validateSvg(m.svg); return { id: m.id, ru: m.ru, cat: 'extra', url: r.ok ? svgDataUrl(r.svg!) : null, errors: r.errors, by: 'claude' } })),
        )
        .catch(() => setExtra([]))
  }, [])

  const pics = useMemo<Pic[]>(() => {
    const out: Pic[] = []
    for (const [path, raw] of Object.entries(files)) {
      const id = path.split('/').pop()!.replace(/\.svg$/, '')
      const m = kitById(id)
      const r = validateSvg(raw)
      out.push({ id, ru: m?.ru ?? '?', cat: categoryOf(id) ?? 'extra', url: r.ok ? svgDataUrl(r.svg!) : null, errors: r.errors, by: 'library' })
    }
    const order = new Map(KIT_LIBRARY.map((m, i) => [m.id, i]))
    return [...out.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9)), ...extra]
  }, [extra])
  const shown = pics.filter((p) => (cat === 'all' || p.cat === cat) && (!packIds || packIds.has(p.id)))
  const cats = [...new Set(pics.map((p) => p.cat))]

  return (
    <div className={`kitlab kit2d${SHEET ? ' sheet' : ''}${COMPACT ? ' compact' : ''}`}>
      <header className="kitlab-head">
        <h1>Картинки · {shown.length} из {pics.length} · нарисовано из {KIT_LIBRARY.length}</h1>
        {!SHEET && (
          <nav>
            <button className={`link${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>все</button>
            {cats.map((c) => (
              <button key={c} className={`link${cat === c ? ' on' : ''}`} onClick={() => setCat(c)}>{CATEGORY_RU[c as Category] ?? 'дорисовка'}</button>
            ))}
          </nav>
        )}
      </header>
      <main className="kitlab-grid">
        {shown.map((p) => (
          <figure key={p.id} className="kitlab-cell">
            <div className="kitlab-view pic">{p.url ? <img src={p.url} alt={p.ru} /> : <span className="small">{p.errors[0]}</span>}</div>
            <figcaption>
              <span className="ru">{p.ru}</span>
              <span className="id">{p.id}{p.by === 'claude' ? ' · claude' : ''}</span>
              <span className="meta">{kitById(p.id)?.hold ?? ''}</span>
            </figcaption>
          </figure>
        ))}
      </main>
    </div>
  )
}
