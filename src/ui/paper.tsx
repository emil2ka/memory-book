// Интерфейс «канцелярия»: бумажные бирки, сургуч, скотч, латунь, чернила.
// Всё нарисовано кодом: рваные края — clip-path из детерминированного шума, детали — встроенный SVG.
// Референс: assets/_raw/ui/ui_A_stationery.jpg. Правила — 02-style-bible.md, раздел «Интерфейс: канцелярия».
// Фактуры (сургуч, бечёвка, скотч, латунь, бумага) — нарисованные заготовки assets/ui/*.webp
// (ChatGPT по тому же референсу, нарезка tools/ui_cut.py); текст и иконки поверх — живой HTML/SVG.
import { useId, useMemo, type CSSProperties, type ReactNode } from 'react'
import sealUrl from '../../assets/ui/seal.webp'
import pinUrl from '../../assets/ui/pin.webp'
import clipUrl from '../../assets/ui/clip.webp'
import tasselUrl from '../../assets/ui/tassel.webp'

const ART = { seal: sealUrl, pin: pinUrl, clip: clipUrl, tassel: tasselUrl }

// ---------- шум ----------

/** Детерминированный генератор 0..1 по строке: у каждой бумажки свой, но постоянный край. */
export function rng(seed: string | number) {
  let h = typeof seed === 'number' ? seed >>> 0 : 2166136261
  if (typeof seed === 'string') for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- формы листов ----------

/** Вершина формы: доля ширины/высоты + сдвиг в px. Порядок — по часовой стрелке от левого верхнего угла. */
interface V { x: number; y: number; dx?: number; dy?: number }

export type SheetShape = 'rect' | 'tag' | 'flag' | 'bookmark'

const SHAPES: Record<SheetShape, V[]> = {
  rect: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  // бирка: срезанные углы слева
  tag: [{ x: 0, y: 0, dx: 24 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1, dx: 24 }, { x: 0, y: 0.5 }],
  // флажок: вырез «ласточкин хвост» справа
  flag: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.5, dx: -16 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
  // закладка: V-вырез снизу
  bookmark: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 1, dy: -30 }, { x: 0, y: 1 }],
}

export type SheetEdge = 'torn' | 'soft' | 'stamp' | 'cut'

/**
 * clip-path рваного листа. w, h — примерный размер в px (сколько зубцов на край).
 * torn — рваная бумага, soft — чуть неровный обрез, stamp — фигурный край почтовой марки, cut — ровный.
 */
export function sheetClip(shape: SheetShape, edge: SheetEdge, w: number, h: number, seed: string): string {
  const r = rng(seed)
  const verts = SHAPES[shape]
  const amp = edge === 'torn' ? 3.2 : edge === 'soft' ? 1.4 : edge === 'stamp' ? 2.6 : 0
  const step = edge === 'torn' ? 9 : edge === 'soft' ? 16 : edge === 'stamp' ? 5 : 1e9
  const pts: string[] = []
  const fmt = (x: number, y: number, dx: number, dy: number) =>
    `calc(${(x * 100).toFixed(2)}% + ${dx.toFixed(1)}px) calc(${(y * 100).toFixed(2)}% + ${dy.toFixed(1)}px)`
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i]
    const b = verts[(i + 1) % verts.length]
    const ax = a.x * w + (a.dx ?? 0)
    const ay = a.y * h + (a.dy ?? 0)
    const bx = b.x * w + (b.dx ?? 0)
    const by = b.y * h + (b.dy ?? 0)
    const len = Math.hypot(bx - ax, by - ay)
    const n = Math.max(1, Math.round(len / step))
    // нормаль внутрь (обход по часовой, y вниз)
    const nx = -(by - ay) / (len || 1)
    const ny = (bx - ax) / (len || 1)
    for (let k = 0; k < n; k++) {
      const t = k / n
      let off: number
      if (edge === 'stamp') off = k % 2 ? amp : 0
      else off = k === 0 ? r() * amp * 0.5 : r() * amp * (r() < 0.12 ? 1.8 : 1)
      const fx = a.x + (b.x - a.x) * t
      const fy = a.y + (b.y - a.y) * t
      const ddx = (a.dx ?? 0) + ((b.dx ?? 0) - (a.dx ?? 0)) * t + nx * off
      const ddy = (a.dy ?? 0) + ((b.dy ?? 0) - (a.dy ?? 0)) * t + ny * off
      pts.push(fmt(fx, fy, ddx, ddy))
    }
  }
  return `polygon(${pts.join(',')})`
}

/**
 * Нарисованные заготовки из assets/ui (ChatGPT, tools/ui_cut.py): карточка с фигурным краем, рваная записка,
 * закладка с V-вырезом, флажок. Фон и border-image — в app.css (.skin-*).
 */
export type SheetSkin = 'card' | 'note' | 'bookmark' | 'flag'

/** Бумажная подложка: тень снаружи, зерно и потёртые края внутри. Кладётся первым ребёнком в position:relative. */
export function Sheet(p: { shape?: SheetShape; edge?: SheetEdge; w: number; h: number; seed: string; tone?: string; className?: string; skin?: SheetSkin | false }) {
  const clip = useMemo(() => sheetClip(p.shape ?? 'rect', p.edge ?? 'torn', p.w, p.h, p.seed), [p.shape, p.edge, p.w, p.h, p.seed])
  // форма сама выбирает нарисованную заготовку; skin={false} — оставить бумагу кодом
  const skin = p.skin === false ? null : p.skin ?? (p.shape === 'bookmark' ? 'bookmark' : p.shape === 'flag' ? 'flag' : p.edge === 'stamp' ? 'card' : null)
  if (skin) return <span className={`sheet skin skin-${skin}${p.className ? ' ' + p.className : ''}`} aria-hidden />
  return (
    <span className={`sheet${p.className ? ' ' + p.className : ''}`} aria-hidden>
      <span className="sheet-fill" style={{ clipPath: clip, ...(p.tone ? { ['--sheet' as string]: p.tone } : {}) }} />
    </span>
  )
}

// ---------- мелкие детали ----------

const INK = 'var(--inkBlue)'

/** Красный штрих-подчёркивание от руки. */
export function Squiggle({ w = 120, className }: { w?: number; className?: string }) {
  return (
    <svg className={`squiggle${className ? ' ' + className : ''}`} width={w} height={10} viewBox="0 0 120 10" preserveAspectRatio="none" aria-hidden>
      <path d="M2 6 C 20 3, 38 8, 58 5 S 96 3, 118 5" fill="none" stroke="var(--brick)" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M30 8 C 50 6, 70 8, 92 7" fill="none" stroke="var(--brick)" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
    </svg>
  )
}

/** Веточка с листьями — в угол бирки и на закладку. */
export function Sprig({ size = 34, flip, className }: { size?: number; flip?: boolean; className?: string }) {
  return (
    <svg className={`sprig${className ? ' ' + className : ''}`} width={size} height={size} viewBox="0 0 40 40" style={flip ? { transform: 'scaleX(-1)' } : undefined} aria-hidden>
      <path d="M4 36 C 14 28, 24 20, 36 6" fill="none" stroke="var(--green)" strokeWidth="1.6" strokeLinecap="round" />
      {[
        [12, 29, -40],
        [18, 24, 30],
        [22, 19, -50],
        [27, 15, 20],
        [31, 10, -45],
      ].map(([x, y, a], i) => (
        <ellipse key={i} cx={x} cy={y} rx="5.2" ry="2.3" transform={`rotate(${a} ${x} ${y}) translate(${i % 2 ? 3 : -3} 0)`} fill={i % 2 ? 'var(--greenSoft)' : 'var(--green)'} opacity="0.92" />
      ))}
    </svg>
  )
}

/** Какая нарисованная полоска скотча (assets/ui/tape_*.webp) ближе к цвету. */
function tapeKind(color: string): 'green' | 'red' | 'mustard' | 'pink' | 'mint' {
  if (/brick|red/i.test(color)) return 'red'
  if (/coral|peach|pink|rose/i.test(color)) return 'pink'
  if (/amber|yellow|mustard|ochre/i.test(color)) return 'mustard'
  if (/mint/i.test(color)) return 'mint'
  return 'green'
}

/** Полоска васи-скотча: нарисованная текстура по цвету (клетка у зелёной и красной). */
export function Tape({ color = 'var(--mint)', w = 54, angle = -4, className, style }: { color?: string; pattern?: 'plain' | 'check'; w?: number; angle?: number; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={`tape-strip tape-${tapeKind(color)}${className ? ' ' + className : ''}`}
      style={{ width: w, height: Math.round(Math.max(14, w / 2.6)), transform: `rotate(${angle}deg)`, ...style }}
      aria-hidden
    />
  )
}

/** Прежняя полоска кодом (SVG) — для витрины «было». */
export function TapeSvg({ color = 'var(--mint)', pattern = 'plain', w = 54, angle = -4, className, style }: { color?: string; pattern?: 'plain' | 'check'; w?: number; angle?: number; className?: string; style?: CSSProperties }) {
  const id = `tape${useId().replace(/:/g, '')}`
  return (
    <svg className={`tape-strip${className ? ' ' + className : ''}`} width={w} height={16} viewBox={`0 0 ${w} 16`} style={{ transform: `rotate(${angle}deg)`, ...style }} aria-hidden>
      <defs>
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill={color} />
          {pattern === 'check' && (
            <>
              <rect width="3" height="6" fill="#fff" opacity="0.35" />
              <rect width="6" height="3" fill="#fff" opacity="0.35" />
            </>
          )}
        </pattern>
      </defs>
      <path
        d={`M2 1 L${w - 2} 0 L${w} 3 L${w - 2} 6 L${w} 9 L${w - 2} 12 L${w} 15 L2 16 L0 13 L2 10 L0 7 L2 4 Z`}
        fill={`url(#${id})`}
        opacity="0.82"
      />
    </svg>
  )
}

/** Латунная кнопка-гвоздик (нарисованная). */
export function Pin({ className }: { className?: string }) {
  return <img className={`pin art${className ? ' ' + className : ''}`} src={ART.pin} width={20} height={29} alt="" aria-hidden draggable={false} />
}

/** Латунная скрепка сверху закладки (нарисованная). */
export function Clip({ className }: { className?: string }) {
  return <img className={`clip art${className ? ' ' + className : ''}`} src={ART.clip} width={22} height={64} alt="" aria-hidden draggable={false} />
}

/** Кисточка: шнурок, узел, нити (нарисованная). */
export function Tassel({ className }: { className?: string }) {
  return <img className={`tassel art${className ? ' ' + className : ''}`} src={ART.tassel} width={52} height={102} alt="" aria-hidden draggable={false} />
}

/** Прежняя кнопка-гвоздик кодом. */
export function PinSvg({ className }: { className?: string }) {
  return (
    <svg className={`pin${className ? ' ' + className : ''}`} width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <defs>
        <radialGradient id="pin-g" cx="0.38" cy="0.32" r="0.7">
          <stop offset="0" stopColor="#fff4c8" />
          <stop offset="0.35" stopColor="var(--amber)" />
          <stop offset="0.8" stopColor="#8c6424" />
          <stop offset="1" stopColor="#5c3f16" />
        </radialGradient>
      </defs>
      <ellipse cx="12.5" cy="14" rx="7" ry="4" fill="rgba(20,10,5,0.35)" />
      <circle cx="11" cy="10" r="7.5" fill="url(#pin-g)" />
      <circle cx="11" cy="10" r="7.5" fill="none" stroke="#5c3f16" strokeWidth="0.8" opacity="0.7" />
      <ellipse cx="8.6" cy="7.4" rx="2.4" ry="1.5" fill="#fffbe6" opacity="0.85" />
    </svg>
  )
}

/** Прежняя скрепка кодом. */
export function ClipSvg({ className }: { className?: string }) {
  return (
    <svg className={`clip${className ? ' ' + className : ''}`} width="26" height="64" viewBox="0 0 26 64" aria-hidden>
      <defs>
        <linearGradient id="clip-g" x1="0" x2="1">
          <stop offset="0" stopColor="#7a5a24" />
          <stop offset="0.45" stopColor="#f4d675" />
          <stop offset="1" stopColor="#8c6424" />
        </linearGradient>
      </defs>
      <path d="M8 40 V10 a5 5 0 0 1 10 0 V48 a8 8 0 0 1 -16 0 V16" fill="none" stroke="url(#clip-g)" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8 40 V10 a5 5 0 0 1 10 0 V48 a8 8 0 0 1 -16 0 V16" fill="none" stroke="rgba(20,10,5,0.25)" strokeWidth="0.6" transform="translate(1 1)" />
    </svg>
  )
}

/** Прежняя кисточка кодом. */
export function TasselSvg({ className }: { className?: string }) {
  return (
    <svg className={`tassel${className ? ' ' + className : ''}`} width="34" height="120" viewBox="0 0 34 120" aria-hidden>
      <path d="M17 0 C 12 18, 22 30, 17 48" fill="none" stroke="#b79a5c" strokeWidth="2" strokeDasharray="3 1.5" />
      <ellipse cx="17" cy="54" rx="6" ry="7" fill="var(--green)" />
      <rect x="10.5" y="58" width="13" height="5" rx="2" fill="#b79a5c" />
      {Array.from({ length: 11 }, (_, i) => {
        const x = 9 + i * 1.6
        return <path key={i} d={`M${x} 62 C ${x - 1} 82, ${x + (i - 5) * 0.6} 98, ${x + (i - 5) * 1.1} 116`} fill="none" stroke={i % 3 ? 'var(--green)' : 'var(--greenSoft)'} strokeWidth="1.6" strokeLinecap="round" />
      })}
    </svg>
  )
}

/** Бечёвка с люверсом и бантом — слева у бирки. */
export function Twine({ className }: { className?: string }) {
  const tw = { fill: 'none', stroke: '#c9a66b', strokeWidth: 2.4, strokeLinecap: 'round' as const }
  const dk = { fill: 'none', stroke: '#8a6a3a', strokeWidth: 0.9, strokeDasharray: '2 2.4', strokeLinecap: 'round' as const }
  const loops = [
    'M40 34 C 26 18, 8 16, 10 28 C 12 38, 30 36, 40 34',
    'M40 34 C 30 44, 14 54, 12 44 C 10 34, 30 32, 40 34',
    'M40 34 C 30 40, 22 58, 18 74',
    'M40 34 C 34 46, 34 62, 30 80',
    'M40 34 C 46 34, 52 34, 58 36',
  ]
  return (
    <svg className={`twine${className ? ' ' + className : ''}`} width="70" height="86" viewBox="0 0 70 86" aria-hidden>
      {loops.map((d, i) => (
        <g key={i}>
          <path d={d} {...tw} />
          <path d={d} {...dk} />
        </g>
      ))}
      <circle cx="40" cy="34" r="4" fill="#c9a66b" />
    </svg>
  )
}

/** Люверс — латунное колечко на бирке. */
export function Eyelet({ className }: { className?: string }) {
  return (
    <svg className={`eyelet${className ? ' ' + className : ''}`} width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <circle cx="9" cy="9" r="7" fill="none" stroke="#a88442" strokeWidth="3.2" />
      <circle cx="9" cy="9" r="7" fill="none" stroke="#f1d98f" strokeWidth="1" strokeDasharray="6 30" />
      <circle cx="9" cy="9" r="4.6" fill="rgba(27,20,16,0.55)" />
    </svg>
  )
}

/** Лучики от руки — появляются при наведении. */
export function Rays({ className }: { className?: string }) {
  return (
    <svg className={`rays${className ? ' ' + className : ''}`} width="30" height="26" viewBox="0 0 30 26" aria-hidden>
      {[
        'M4 22 L10 16',
        'M14 14 L16 4',
        'M20 16 L28 10',
      ].map((d, i) => (
        <path key={i} d={d} stroke="var(--inkBlue)" strokeWidth="2" strokeLinecap="round" />
      ))}
    </svg>
  )
}

/** Загрузчик — пунктирный кружок. */
export function Spinner({ size = 26 }: { size?: number }) {
  return (
    <svg className="spinner" width={size} height={size} viewBox="0 0 26 26" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2
        return <circle key={i} cx={13 + Math.cos(a) * 9.5} cy={13 + Math.sin(a) * 9.5} r={1.1 + (i / 9) * 1.3} fill="var(--inkBlue)" opacity={0.25 + (i / 9) * 0.75} />
      })}
    </svg>
  )
}

// ---------- иконки (тёмно-синие чернила): нарисованные, где есть, иначе SVG ----------

export type IconName =
  | 'replay' | 'download' | 'trash' | 'pencil' | 'plus' | 'minus' | 'photo' | 'note' | 'heart' | 'check'
  | 'shelf' | 'fold' | 'skip' | 'file' | 'link' | 'save' | 'open' | 'book'

const ICONS: Record<IconName, ReactNode> = {
  replay: <><path d="M6 8 A8.5 8.5 0 1 1 4.6 15" /><path d="M2.5 4.5 L6 8.4 L10.3 6.4" /></>,
  download: <><path d="M12 3 V15" /><path d="M7 10.5 L12 15.5 L17 10.5" /><path d="M4 16 V20 H20 V16" /></>,
  trash: <><path d="M4 6.5 H20" /><path d="M9 6.5 V4 H15 V6.5" /><path d="M6 6.5 L7.2 20.5 H16.8 L18 6.5" /><path d="M10 10 V17 M14 10 V17" /></>,
  pencil: <><path d="M15.5 4.5 L19.5 8.5 L8.5 19.5 L3.8 20.2 L4.5 15.5 Z" /><path d="M13.5 6.5 L17.5 10.5" /></>,
  plus: <><path d="M12 5 V19 M5 12 H19" /></>,
  minus: <><path d="M5 12 H19" /></>,
  photo: <><rect x="6" y="3.5" width="15" height="12" rx="1" transform="rotate(8 13 9)" /><rect x="3" y="7" width="15" height="12.5" rx="1" /><path d="M4.5 17 L8.5 12.5 L11.5 15.5 L13.5 13.5 L16.5 17" /><circle cx="13.5" cy="10.5" r="1.3" /></>,
  note: <><path d="M9 17.5 V5 L19 3 V15.5" /><ellipse cx="6.8" cy="17.8" rx="2.6" ry="2" /><ellipse cx="16.8" cy="15.8" rx="2.6" ry="2" /></>,
  heart: <><path d="M12 19 C 5 14, 3 10, 5.5 7 C 7.5 4.8, 10.5 5.5, 12 8 C 13.5 5.5, 16.5 4.8, 18.5 7 C 21 10, 19 14, 12 19 Z" /></>,
  check: <><path d="M4 12.5 L9.5 18 L20 6" /></>,
  shelf: <><path d="M3 19.5 H21" /><path d="M5 19.5 V7 H8 V19.5 M8.5 19.5 V5 H11.5 V19.5 M12.5 19.5 L15 8 L18 8.6 L15.8 19.5" /></>,
  fold: <><path d="M6 14.5 L12 8.5 L18 14.5" /></>,
  skip: <><path d="M5 6 L11 12 L5 18 M12 6 L18 12 L12 18" /></>,
  file: <><path d="M6 3 H14 L18.5 7.5 V21 H6 Z" /><path d="M14 3 V7.5 H18.5" /><path d="M9 14.5 V11 L14 10 V13.5" /><circle cx="8.3" cy="15" r="1.3" /><circle cx="13.3" cy="14" r="1.3" /></>,
  link: <><path d="M10 14 L14 10" /><path d="M8.5 11 L6 13.5 A3.5 3.5 0 0 0 11 18.5 L13.5 16" /><path d="M10.5 8 L13 5.5 A3.5 3.5 0 0 1 18 10.5 L15.5 13" /></>,
  save: <><path d="M5 4 H16.5 L20 7.5 V20 H5 Z" /><path d="M8 4 V9 H15 V4" /><path d="M8 20 V14 H16 V20" /></>,
  open: <><path d="M14 4 H20 V10" /><path d="M20 4 L11 13" /><path d="M18 14 V20 H4 V6 H10" /></>,
  book: <><path d="M12 6.5 C 9.5 4.8, 6 4.5, 3 5.5 V18.5 C 6 17.5, 9.5 17.8, 12 19.5 C 14.5 17.8, 18 17.5, 21 18.5 V5.5 C 18 4.5, 14.5 4.8, 12 6.5 Z" /><path d="M12 6.5 V19.5" /></>,
}

// нарисованные иконки (ChatGPT, тот же чат, что фактуры; лист assets/_raw/ui/tex/j_icons_raw.png, нарезка tools/icon_cut.py)
const DRAWN = import.meta.glob('../../assets/ui/icons/*.webp', { query: '?url', import: 'default', eager: true }) as Record<string, string>

export function Icon({ name, size = 22, className }: { name: IconName; size?: number; className?: string }) {
  const drawn = DRAWN[`../../assets/ui/icons/${name}.webp`]
  if (drawn) return <img className={`icon drawn${className ? ' ' + className : ''}`} src={drawn} width={size} height={size} alt="" aria-hidden draggable={false} />
  return (
    <svg className={`icon${className ? ' ' + className : ''}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  )
}

// ---------- кнопки ----------

type BtnProps = {
  onClick?: () => void
  disabled?: boolean
  ariaLabel?: string
  className?: string
  style?: CSSProperties
  title?: string
}

/** Главная кнопка — кремовая бирка с люверсом, бантом из бечёвки, веточкой и красным штрихом. */
export function TagButton(p: BtnProps & { children: ReactNode; small?: boolean; seed?: string }) {
  const w = p.small ? 168 : 236
  const h = p.small ? 50 : 68
  return (
    <button className={`tag-btn${p.small ? ' small' : ''}${p.className ? ' ' + p.className : ''}`} onClick={p.onClick} disabled={p.disabled} aria-label={p.ariaLabel} title={p.title} style={p.style} data-w={w} data-h={h}>
      <span className="tag-body">
        {/* бумажная бирка (border-image тянет середину) и поверх — левый край с люверсом и бантом из бечёвки */}
        <span className="tag-skin" aria-hidden />
        <span className="tag-text">
          {p.children}
          <Squiggle w={p.small ? 70 : 104} />
        </span>
        <Sprig size={p.small ? 22 : 30} className="tag-sprig" />
      </span>
      <span className="tag-bow" aria-hidden />
    </button>
  )
}

/** «Собрать день» — сургучная печать с лентами. */
export function SealButton(p: BtnProps & { busy?: boolean; label?: ReactNode }) {
  return (
    <button className={`seal-btn${p.busy ? ' busy' : ''}${p.className ? ' ' + p.className : ''}`} onClick={p.onClick} disabled={p.disabled} aria-label={p.ariaLabel ?? 'Собрать день'} title={p.title} style={p.style}>
      <Rays className="seal-rays a" />
      <Rays className="seal-rays b" />
      <img className="seal-art" src={ART.seal} alt="" aria-hidden draggable={false} />
      <span className="seal-text">{p.label ?? <>Собрать<br />день</>}</span>
    </button>
  )
}

const SEAL_BLOB = (() => {
  const r = rng('seal-v2')
  const n = 22
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rad = 74 + (i % 2 ? 6 : 0) + r() * 6
    pts.push([100 + Math.cos(a) * rad, 92 + Math.sin(a) * rad])
  }
  // сглаженный контур: кривые через вершины, концы — середины соседних рёбер
  const mid = (i: number) => {
    const [x0, y0] = pts[i % n]
    const [x1, y1] = pts[(i + 1) % n]
    return `${((x0 + x1) / 2).toFixed(1)} ${((y0 + y1) / 2).toFixed(1)}`
  }
  let d = `M${mid(0)}`
  for (let i = 1; i <= n; i++) d += ` Q${pts[i % n][0].toFixed(1)} ${pts[i % n][1].toFixed(1)} ${mid(i)}`
  return d + ' Z'
})()

/** Прежняя печать кодом (SVG) — для витрины «было». */
export function SealArtSvg() {
  return (
    <svg className="seal-art" viewBox="0 0 200 250" aria-hidden>
      <defs>
        <radialGradient id="wax" cx="0.42" cy="0.36" r="0.72">
          <stop offset="0" stopColor="#d9604a" />
          <stop offset="0.45" stopColor="var(--brick)" />
          <stop offset="0.85" stopColor="var(--brickDark)" />
          <stop offset="1" stopColor="#4e1a14" />
        </radialGradient>
        <radialGradient id="wax-in" cx="0.55" cy="0.62" r="0.7">
          <stop offset="0" stopColor="#a63a28" />
          <stop offset="1" stopColor="#7a2a1e" />
        </radialGradient>
        <linearGradient id="ribbon" x1="0" x2="1">
          <stop offset="0" stopColor="#7a2a1e" />
          <stop offset="0.5" stopColor="#b5432f" />
          <stop offset="1" stopColor="#6e241a" />
        </linearGradient>
      </defs>
      {/* ленты */}
      <path d="M78 150 L52 238 L66 226 L76 244 L104 160 Z" fill="url(#ribbon)" />
      <path d="M122 150 L148 238 L134 226 L124 244 L96 160 Z" fill="url(#ribbon)" />
      <path d="M78 150 L52 238" stroke="#4e1a14" strokeWidth="1" opacity="0.5" />
      <path d="M122 150 L148 238" stroke="#4e1a14" strokeWidth="1" opacity="0.5" />
      {/* воск */}
      <path d={SEAL_BLOB} fill="url(#wax)" />
      <circle cx="100" cy="92" r="56" fill="url(#wax-in)" />
      <circle cx="100" cy="92" r="56" fill="none" stroke="#4e1a14" strokeWidth="3" opacity="0.55" />
      <circle cx="101" cy="93.5" r="56" fill="none" stroke="#e98a70" strokeWidth="1.2" opacity="0.45" />
      {/* эмблема-книжка */}
      <g transform="translate(86.2 36) scale(1.15)" fill="none" stroke="#f3e6c8" strokeWidth="1.6" strokeLinejoin="round" opacity="0.9">
        <path d="M12 6.5 C 9.5 4.8, 6 4.5, 3 5.5 V16.5 C 6 15.5, 9.5 15.8, 12 17.5 C 14.5 15.8, 18 15.5, 21 16.5 V5.5 C 18 4.5, 14.5 4.8, 12 6.5 Z" />
        <path d="M12 6.5 V17.5" />
      </g>
      {/* веточки по низу */}
      <g stroke="#f3e6c8" strokeWidth="1.3" fill="none" opacity="0.55" strokeLinecap="round">
        <path d="M66 128 C 74 136, 84 140, 94 140" />
        <path d="M134 128 C 126 136, 116 140, 106 140" />
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <path d={`M${72 + i * 7} ${133 + i * 2.2} l -3 -5`} />
            <path d={`M${128 - i * 7} ${133 + i * 2.2} l 3 -5`} />
          </g>
        ))}
      </g>
      {/* блик */}
      <ellipse cx="72" cy="52" rx="16" ry="7" fill="#fff" opacity="0.16" transform="rotate(-30 72 52)" />
    </svg>
  )
}

/** «← На полку» — бумажный флажок с вырезом справа и зелёным краем. */
export function FlagButton(p: BtnProps & { children: ReactNode; seed?: string }) {
  return (
    <button className={`flag-btn${p.className ? ' ' + p.className : ''}`} onClick={p.onClick} disabled={p.disabled} aria-label={p.ariaLabel} title={p.title} style={p.style}>
      <Sheet shape="flag" edge="soft" w={150} h={40} seed={p.seed ?? 'flag'} />
      <span className="flag-edge" aria-hidden />
      <span className="flag-text">{p.children}</span>
    </button>
  )
}

const TAPES: { color: string; pattern: 'plain' | 'check' }[] = [
  { color: 'var(--greenSoft)', pattern: 'check' },
  { color: 'var(--brick)', pattern: 'check' },
  { color: 'var(--amber)', pattern: 'check' },
  { color: 'var(--peach)', pattern: 'check' },
  { color: 'var(--mint)', pattern: 'plain' },
  { color: 'var(--greyBlue)', pattern: 'check' },
]

/** Маленькое действие — квадратная бумажная карточка с фигурным краем и полоской скотча сверху. */
export function CardButton(p: BtnProps & { icon: IconName; label: string; tape?: number; mini?: boolean }) {
  const t = TAPES[(p.tape ?? 0) % TAPES.length]
  return (
    <button className={`card-btn${p.mini ? ' mini' : ''}${p.className ? ' ' + p.className : ''}`} onClick={p.onClick} disabled={p.disabled} aria-label={p.ariaLabel ?? p.label} title={p.title} style={p.style}>
      <Sheet edge="stamp" w={p.mini ? 64 : 78} h={p.mini ? 50 : 70} seed={`card-${p.label}`} />
      <Tape color={t.color} pattern={t.pattern} w={p.mini ? 26 : 34} angle={((p.tape ?? 0) % 3) * 3 - 3} className="card-tape" />
      <Icon name={p.icon} size={p.mini ? 17 : 24} />
      <span className="card-label">{p.label}</span>
    </button>
  )
}

/** Небольшая бумажная кнопка-полоска (ок, файл/ссылка, другой файл). */
export function SlipButton(p: BtnProps & { children: ReactNode; on?: boolean; seed?: string }) {
  return (
    <button className={`slip-btn${p.on ? ' on' : ''}${p.className ? ' ' + p.className : ''}`} onClick={p.onClick} disabled={p.disabled} aria-label={p.ariaLabel} aria-pressed={p.on} title={p.title} style={p.style}>
      <Sheet edge="soft" w={90} h={28} seed={p.seed ?? `slip-${String(p.children)}`} />
      <span className="slip-text">{p.children}</span>
    </button>
  )
}

/** Статус — рваная записка на латунной кнопке, с пунктирным кружком. */
export function PinNote(p: { children: ReactNode; spinner?: boolean; className?: string; style?: CSSProperties; seed?: string; role?: string }) {
  return (
    <div className={`pin-note${p.className ? ' ' + p.className : ''}`} style={p.style} role={p.role ?? 'status'} aria-live="polite">
      <Sheet edge="torn" w={160} h={110} seed={p.seed ?? 'note'} skin="note" />
      <Pin />
      {p.spinner && <Spinner />}
      <span className="pin-note-text">{p.children}</span>
    </div>
  )
}
