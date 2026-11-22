// Витрина штрихов (?lab=pen): буквы рукописного шрифта со штрихами поверх (порядок — цветом и номером)
// и живое письмо — ручка выводит фразу по штрихам, чернила проступают под кончиком.
import { useEffect, useRef, useState } from 'react'
import { HAND_FONT } from '../scene/Book'
import { PenWriter } from '../write/pen'
import { glyphStrokes } from '../write/strokes'

const FAMILY = `${HAND_FONT}, "Bradley Hand", "Segoe Print", cursive`
const ALPHABET = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюяәғқңөұүһі' + 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЭЮЯӘҒҚҢӨҰҮҺІ' + '0123456789.,!?—'
const COLORS = ['#b5432f', '#2c3b58', '#55784a', '#c9953d', '#8a5a7c', '#3b8483']

function Letter({ ch, ready }: { ch: string; ready: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const S = 90
    c.width = 96
    c.height = 120
    const g = c.getContext('2d')!
    g.fillStyle = '#f3e6c8'
    g.fillRect(0, 0, c.width, c.height)
    const ox = 18
    const base = 86
    g.font = `${S}px ${FAMILY}`
    g.fillStyle = 'rgba(44,59,88,0.18)'
    g.fillText(ch, ox, base)
    const gl = glyphStrokes(ch, FAMILY)
    gl?.strokes.forEach((s, i) => {
      g.strokeStyle = COLORS[i % COLORS.length]
      g.lineWidth = 2
      g.beginPath()
      s.forEach(([x, y], k) => (k ? g.lineTo(ox + x * S, base + y * S) : g.moveTo(ox + x * S, base + y * S)))
      g.stroke()
      const [sx, sy] = s[0]
      g.fillStyle = COLORS[i % COLORS.length]
      g.beginPath()
      g.arc(ox + sx * S, base + sy * S, 3.5, 0, 7)
      g.fill()
      g.font = '10px Inter, sans-serif'
      g.fillText(String(i + 1), ox + sx * S + 4, base + sy * S - 4)
      g.font = `${S}px ${FAMILY}`
    })
  }, [ch, ready])
  return <canvas ref={ref} title={ch} style={{ width: 96, height: 120 }} />
}

function LiveWriting({ phrase, ready }: { phrase: string; ready: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const S = 56
    c.width = 1100
    c.height = 110
    const g = c.getContext('2d')!
    const writer = new PenWriter((ch) => glyphStrokes(ch, FAMILY))
    let shown = ''
    let i = 0
    let last = performance.now()
    let nextKey = last + 400
    let raf = 0
    const xs: number[] = []
    g.font = `${S}px ${FAMILY}`
    for (let k = 0, x = 20; k <= phrase.length; k++) {
      xs.push(x)
      x = 20 + g.measureText(phrase.slice(0, k + 1)).width
    }
    const base = 78
    const frame = (now: number) => {
      // «печатаем» по букве каждые 170 мс, после фразы — пауза и заново
      if (now > nextKey) {
        if (i < phrase.length) {
          shown += phrase[i++]
          writer.setText(shown)
          nextKey = now + 170
        } else {
          shown = ''
          i = 0
          writer.reset('')
          nextKey = now + 1200
        }
      }
      writer.update((now - last) / 1000)
      last = now
      const ink = writer.ink()
      g.fillStyle = '#f3e6c8'
      g.fillRect(0, 0, c.width, c.height)
      g.fillStyle = '#cbb78d'
      g.fillRect(10, base + 8, c.width - 20, 1)
      g.font = `${S}px ${FAMILY}`
      g.fillStyle = '#18223a'
      const upTo = ink ? ink.upTo : shown.length
      g.fillText(shown.slice(0, upTo), 20, base)
      if (ink?.partial) {
        g.save()
        g.beginPath()
        for (const [x, y] of ink.partial.pts) {
          g.moveTo(xs[ink.partial.index] + x * S + ink.partial.r * S, base + y * S)
          g.arc(xs[ink.partial.index] + x * S, base + y * S, ink.partial.r * S, 0, 7)
        }
        g.clip()
        g.fillText(shown[ink.partial.index], xs[ink.partial.index], base)
        g.restore()
      }
      const pen = writer.pen()
      if (pen) {
        g.fillStyle = pen.down ? '#b5432f' : 'rgba(181,67,47,0.35)'
        g.beginPath()
        g.arc(xs[pen.index] + pen.x * S, base + pen.y * S, pen.down ? 4 : 6, 0, 7)
        g.fill()
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [phrase, ready])
  return <canvas ref={ref} style={{ width: 1100, height: 110, display: 'block' }} />
}

export default function PenLab() {
  const [ready, setReady] = useState(0)
  useEffect(() => {
    document.fonts?.load(`48px ${HAND_FONT}`, 'АаӘәҚқ').then(() => setReady((r) => r + 1))
  }, [])
  return (
    <div style={{ minHeight: '100vh', background: '#3a2618', padding: 20, overflow: 'auto', fontFamily: 'Inter, sans-serif', color: '#f3e6c8' }}>
      <h1 style={{ font: `700 34px ${FAMILY}`, margin: '0 0 10px' }}>Ручка пишет букву — штрихи из шрифта</h1>
      <LiveWriting phrase="Сегодня шёл первый снег. Бүгін қар жауды!" ready={ready} />
      <p style={{ fontSize: 12, opacity: 0.8 }}>Цвет и номер — порядок штрихов, точка — где ручка касается бумаги.</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {[...ALPHABET].map((ch, i) => (
          <Letter key={i} ch={ch} ready={ready} />
        ))}
      </div>
    </div>
  )
}
