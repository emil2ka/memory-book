import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KIT_LIBRARY, kitById } from './library'
import { validateSvg } from './svg'

const dir = join(__dirname, '../../assets/kit2d')

describe('картинки предметов (SVG)', () => {
  it('все файлы assets/kit2d проходят проверку и есть в библиотеке', () => {
    for (const f of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
      const r = validateSvg(readFileSync(join(dir, f), 'utf8'))
      expect(r.errors, f).toEqual([])
      expect(kitById(f.replace(/\.svg$/, '')), f).toBeDefined()
    }
  })

  it('у каждого предмета библиотеки есть картинка, stems от 3 букв', () => {
    const have = new Set(readdirSync(dir).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, '')))
    for (const m of KIT_LIBRARY) {
      expect(have.has(m.id), m.id).toBe(true)
      for (const st of m.stems) expect(st.replace(/\$$/, '').length, `${m.id}: ${st}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('отклоняет опасное и чужие цвета', () => {
    const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + '<rect x="1" y="1" width="5" height="5" fill="#b5432f"/>'.repeat(6) + '</svg>'
    expect(validateSvg(ok).ok).toBe(true)
    expect(validateSvg(ok.replace('</svg>', '<script>alert(1)</script></svg>')).ok).toBe(false)
    expect(validateSvg(ok.replace('</svg>', '<image href="http://x"/></svg>')).ok).toBe(false)
    expect(validateSvg(ok.replace('</svg>', '<text>hi</text></svg>')).ok).toBe(false)
    expect(validateSvg(ok.replace('<rect x="1"', '<rect onload="x()" x="1"')).ok).toBe(false)
    expect(validateSvg(ok.replace('fill="#b5432f"', 'fill="url(#g)"')).ok).toBe(false)
    const red = ok.replace('fill="#b5432f"', 'fill="#ff0000"')
    expect(validateSvg(red).ok).toBe(false)
    const fit = validateSvg(red, { fit: true })
    expect(fit.ok).toBe(true)
    expect(fit.svg).not.toContain('#ff0000')
    expect(validateSvg(ok.replace('0 0 100 100', '0 0 50 50')).ok).toBe(false)
    const broken = ok.replace('/><rect', '/>rect').replace('</svg>', '')
    expect(validateSvg(broken).ok).toBe(false)
    expect(validateSvg(broken, { fit: true }).ok).toBe(true)
    const cutTail = ok.replace('</svg>', '<ellipse cx=</svg>')
    expect(validateSvg(cutTail, { fit: true }).ok).toBe(true)
    const dash = ok.replace('<rect x="1"', '<rect stroke-dasharray="2" x="1"')
    expect(validateSvg(dash).ok).toBe(false)
    expect(validateSvg(dash, { fit: true }).ok).toBe(true)
    expect(validateSvg(ok.replace('<rect x="1"', '<rect onclick="x()" x="1"'), { fit: true }).ok).toBe(false)
  })
})
