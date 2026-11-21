# Помощники для рисования картинок предметов (SVG 100×100, предмет стоит на линии y≈96).
# Стиль: плоская заливка цветом палитры, тёмный контур ink 2.5, тень справа (темнее в той же семье), блик слева.
import math, os

INK = '#1b1410'
H = dict(ink='#1b1410', brownDark='#3a2618', brown='#5c3b22', wood='#8a5a33', woodLight='#b07a45', ochre='#c9953d',
         amber='#e8b04a', yellow='#f4d675', cream='#f3e6c8', paper='#e9d9b4', paperShade='#cbb78d', white='#fbf6ea',
         brickDark='#7a2e24', brick='#b5432f', coral='#e0745a', peach='#f2a983', greenDark='#2f4a36', green='#55784a',
         greenSoft='#8fa868', mint='#c3d39a', tealDark='#1f4a50', teal='#3b8483', navy='#18223a', slateDark='#2c3b58',
         slate='#4a6285', greyBlue='#7f97b3', ice='#bcd3e3', frost='#e3f0f5', plum='#4a2a45', mauve='#8a5a7c',
         grey='#8c8478', greyLight='#bfb7a6', skin='#f6cfac', skinShade='#de9f7e')
OUT = os.path.join(os.path.dirname(__file__), '..')


def svg(*body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" stroke-linejoin="round" stroke-linecap="round">\n'
            + '\n'.join(b for b in body if b) + '\n</svg>\n')


def st(w=2.5):
    return f' stroke="{INK}" stroke-width="{w}"'


def fill(d, c):
    """Заливка без контура (тени, блики, полосы)."""
    return f'<path d="{d}" fill="{H[c]}"/>'


def out(d, w=2.5):
    """Контур поверх уже залитой формы."""
    return f'<path d="{d}" fill="none"{st(w)}/>'


def shape(d, c, w=2.5):
    return f'<path d="{d}" fill="{H[c]}"{st(w)}/>'


def tube(d, c, w):
    """Толстая линия с контуром: ручки, стебли, спицы."""
    return f'<path d="{d}" fill="none"{st(w + 5)}/><path d="{d}" fill="none" stroke="{H[c]}" stroke-width="{w}"/>'


def line(d, c, w=2):
    return f'<path d="{d}" fill="none" stroke="{H[c]}" stroke-width="{w}"/>'


def rect(x, y, w, h, c, rx=0, stroke=2.5, tr=''):
    s = st(stroke) if stroke else ''
    t = f' transform="{tr}"' if tr else ''
    r = f' rx="{rx}"' if rx else ''
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}"{r} fill="{H[c]}"{s}{t}/>'


def circle(cx, cy, r, c, stroke=2.5):
    s = st(stroke) if stroke else ''
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{H[c]}"{s}/>'


def ell(cx, cy, rx, ry, c, stroke=2.5, rot=0):
    s = st(stroke) if stroke else ''
    t = f' transform="rotate({rot} {cx} {cy})"' if rot else ''
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{H[c]}"{s}{t}/>'


def poly(pts, c, stroke=2.5):
    s = st(stroke) if stroke else ''
    return f'<polygon points="{" ".join(f"{x:.1f},{y:.1f}" for x, y in pts)}" fill="{H[c]}"{s}/>'


def group(tr, *body):
    return f'<g transform="{tr}">' + ''.join(body) + '</g>'


def face(cx, cy, gap=15, eye=2.6, blush='coral', smile=True):
    """Милое лицо: глаза-точки с бликом, румянец, улыбка."""
    g = gap / 2
    s = (ell(cx - g, cy, eye, eye * 1.3, 'ink', 0) + ell(cx + g, cy, eye, eye * 1.3, 'ink', 0)
         + circle(cx - g + 0.9, cy - 1.3, eye * 0.38, 'white', 0) + circle(cx + g + 0.9, cy - 1.3, eye * 0.38, 'white', 0))
    if blush:
        s += ell(cx - g - 4.5, cy + 6, 3.8, 2.2, blush, 0) + ell(cx + g + 4.5, cy + 6, 3.8, 2.2, blush, 0)
    if smile:
        s += f'<path d="M{cx - 4} {cy + 6} Q{cx} {cy + 10} {cx + 4} {cy + 6}" fill="none"{st(2.2)}/>'
    return s


def star_pts(cx, cy, r1, r2, n=5, rot=0):
    pts = []
    for i in range(n * 2):
        a = rot + i * math.pi / n
        r = r1 if i % 2 == 0 else r2
        pts.append((cx + r * math.sin(a), cy - r * math.cos(a)))
    return pts


def ring_pts(cx, cy, r, n, start=0):
    return [(cx + r * math.sin(start + i * 2 * math.pi / n), cy - r * math.cos(start + i * 2 * math.pi / n)) for i in range(n)]


def save(name, content):
    with open(os.path.join(OUT, f'{name}.svg'), 'w') as f:
        f.write(content)


# ---------- предметы только картинкой (пачки 5+) ----------
import json

META = []


def item(id, cat, ru, kk, en, stems, tags, hold, body, fx=None):
    """Нарисовать предмет и записать его поля поиска (для assets/kit2d/meta.json)."""
    save(id, body if body.startswith('<svg') else svg(body))
    m = dict(id=id, cat=cat, ru=ru, kk=kk, en=en, stems=stems, tags=tags, hold=hold)
    if fx:
        m['fx'] = [{'kind': k} for k in fx]
    META.append(m)


def write_meta(pack):
    """Заменить в meta.json записи этой пачки на свежие."""
    path = os.path.join(OUT, 'meta.json')
    try:
        old = json.load(open(path))
    except Exception:
        old = []
    ids = {m['id'] for m in META}
    rest = [m for m in old if m.get('pack') != pack and m['id'] not in ids]
    out = rest + [dict(m, pack=pack) for m in META]
    with open(path, 'w') as f:
        f.write('[\n' + ',\n'.join(json.dumps(m, ensure_ascii=False) for m in out) + '\n]\n')
    print(f'{pack}: {len(META)} предметов, всего в meta.json {len(out)}')
