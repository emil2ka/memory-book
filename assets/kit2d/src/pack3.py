# Пачка 3 картинок: еда и напитки.
from lib import *

D = {}

def glass(x0, x1, y0, y1, liquid, liquid_dark, top=None):
    """Стакан: жидкость до top, выше стекло (frost), контур, блик."""
    top = top or y0 + 10
    g = f'M{x0} {y0} L{x0 + 3} {y1 - 4} Q{x0 + 4} {y1} {x0 + 8} {y1} L{x1 - 8} {y1} Q{x1 - 4} {y1} {x1 - 3} {y1 - 4} L{x1} {y0} Z'
    return (fill(g, 'frost') + fill(f'M{x0 + 1.3} {top} L{x1 - 1.3} {top} L{x1 - 3} {y1 - 4} Q{x1 - 4} {y1} {x1 - 8} {y1} L{x0 + 8} {y1} Q{x0 + 4} {y1} {x0 + 3} {y1 - 4} Z', liquid)
            + fill(f'M{x1 - 12} {top} L{x1 - 1.3} {top} L{x1 - 3} {y1 - 4} Q{x1 - 4} {y1} {x1 - 8} {y1} L{x1 - 14} {y1} Q{x1 - 10} {y1 - 20} {x1 - 12} {top} Z', liquid_dark)
            + rect(x0 + 6, top + 4, 4, (y1 - top) * 0.55, 'white', 2, 0) + out(g) + ell((x0 + x1) / 2, y0, (x1 - x0) / 2, 4, 'frost'))

D['juice'] = svg(glass(28, 72, 26, 94, 'amber', 'ochre', 38), ell(50, 38, 20.5, 3.4, 'yellow', 0),
                 tube('M58 38 L66 10 L78 6', 'brick', 3), rect(36, 32, 8, 8, 'frost', 1.5, 2, 'rotate(15 40 36)'),
                 circle(28, 30, 11, 'coral'), circle(28, 30, 8, 'amber', 0), line('M28 22 L28 38 M20 30 L36 30 M22 24 L34 36 M34 24 L22 36', 'yellow', 1.4))

B = 'M36 30 Q36 24 42 22 L42 14 L58 14 L58 22 Q64 24 64 30 L66 86 Q66 94 58 94 L42 94 Q34 94 34 86 Z'
D['water_bottle'] = svg(
    fill(B, 'ice'), fill('M56 26 Q64 26 64 30 L66 86 Q66 94 58 94 L54 94 Q60 70 56 26 Z', 'greyBlue'),
    rect(34, 50, 32, 22, 'white', 0, 2), rect(34, 56, 32, 6, 'teal', 0, 0), poly([(50, 58), (52, 60), (50, 62), (48, 60)], 'white', 0),
    rect(39, 30, 4, 16, 'frost', 2, 0), rect(39, 76, 4, 12, 'frost', 2, 0), out(B), line('M36 40 L64 40 M35 80 L65 80', 'greyBlue', 1.5),
    rect(40, 6, 20, 10, 'teal', 2), line('M44 8 L44 14 M48 8 L48 14 M52 8 L52 14 M56 8 L56 14', 'tealDark', 1.2),
)

D['milk'] = svg(
    poly([(26, 34), (50, 14), (74, 34)], 'white'), poly([(50, 14), (74, 34), (62, 34)], 'paper', 0), rect(44, 8, 12, 7, 'white', 1, 2),
    rect(26, 34, 48, 60, 'white', 2), rect(62, 34, 12, 60, 'paper', 0, 0), out('M26 34 L26 94 L74 94 L74 34 Z'),
    rect(30, 54, 40, 26, 'ice', 3, 2), ell(41, 64, 6, 4, 'ink', 0, -20), ell(58, 72, 4, 3, 'ink', 0, 15), ell(62, 60, 2.5, 2, 'ink', 0),
    rect(26, 84, 48, 6, 'greyBlue', 0, 2), rect(56, 18, 7, 7, 'greyBlue', 2, 2), rect(30, 38, 4, 12, 'white', 2, 0),
)

D['lemonade'] = svg(tube('M72 44 C88 44 88 76 72 76', 'frost', 5), glass(26, 74, 28, 94, 'yellow', 'amber', 40),
                    circle(50, 66, 11, 'amber'), circle(50, 66, 8.5, 'cream', 0), line('M50 58 L50 74 M42 66 L58 66 M44 60 L56 72 M56 60 L44 72', 'yellow', 1.4),
                    tube('M60 40 L70 8', 'coral', 3), ell(36, 36, 7, 4, 'green', 2, -25), circle(64, 34, 8, 'yellow'), circle(64, 34, 5.5, 'cream', 0))

D['milkshake'] = svg(
    ell(50, 93, 14, 3.5, 'frost'), rect(46, 80, 8, 12, 'frost', 1, 2),
    shape('M28 40 L34 78 Q36 82 42 82 L58 82 Q64 82 66 78 L72 40 Z', 'peach'), fill('M60 40 L72 40 L66 78 Q64 82 58 82 L54 82 Q62 70 60 40 Z', 'coral'),
    rect(30, 52, 40, 5, 'coral', 0, 0), rect(33, 46, 4, 26, 'white', 2, 0),
    ell(50, 38, 25, 6, 'frost'), shape('M26 38 Q26 26 38 26 Q40 16 52 18 Q64 18 64 28 Q76 28 74 38 Z', 'white'),
    tube('M44 30 L36 4', 'coral', 3), line('M43 26 L40 17', 'white', 3), circle(56, 14, 6, 'brick'), tube('M57 8 Q60 2 66 2', 'greenDark', 1.5), circle(54, 12, 1.6, 'coral', 0),
)

D['soda_can'] = svg(
    rect(28, 14, 44, 80, 'brick', 8), fill('M60 16 Q72 16 72 24 L72 84 Q72 94 62 94 L58 94 Q64 60 60 16 Z', 'brickDark'),
    rect(28, 14, 44, 10, 'greyLight', 4), rect(28, 84, 44, 10, 'greyLight', 4), rect(36, 8, 28, 8, 'greyLight', 3), rect(44, 6, 14, 5, 'grey', 2, 2),
    shape('M28 52 Q44 42 72 50 L72 62 Q50 52 28 64 Z', 'white', 2), rect(33, 28, 4, 18, 'coral', 2, 0),
    circle(40, 74, 2.5, 'frost', 1.2), circle(60, 34, 2, 'frost', 1.2), circle(64, 74, 1.8, 'frost', 1.2),
)

D['thermos'] = svg(
    rect(26, 26, 34, 68, 'teal', 8), fill('M50 28 Q60 28 60 34 L60 86 Q60 94 52 94 Q56 60 50 28 Z', 'tealDark'),
    rect(26, 56, 34, 7, 'greyLight', 0, 2), rect(30, 34, 4, 18, 'mint', 2, 0), rect(28, 16, 30, 12, 'tealDark', 3),
    rect(62, 52, 24, 26, 'tealDark', 4), ell(74, 52, 12, 3.5, 'tealDark'), ell(74, 52.5, 9, 2, 'brown', 0),
    tube('M70 40 C66 34 74 30 70 24', 'frost', 2), tube('M80 42 C76 36 84 32 80 26', 'frost', 2),
)

T = 'M20 60 Q20 34 50 32 Q80 34 80 60 Q80 88 50 88 Q20 88 20 60 Z'
D['teapot'] = svg(
    tube('M78 50 C94 52 92 70 80 68', 'white', 5), tube('M22 56 Q10 52 6 36', 'white', 5),
    fill(T, 'white'), fill('M64 36 Q80 42 80 60 Q80 88 50 88 Q72 76 64 36 Z', 'paperShade'),
    rect(20, 58, 60, 7, 'teal', 0, 0), *[poly([(x, 59), (x + 3, 61.5), (x, 64), (x - 3, 61.5)], 'white', 0) for x in (30, 42, 54, 66)],
    ell(32, 46, 4, 7, 'frost', 0, 30), out(T), ell(50, 88, 18, 3.5, 'white'),
    shape('M36 34 Q36 22 50 22 Q64 22 64 34 Z', 'teal'), circle(50, 18, 4.5, 'tealDark'),
)

D['burger'] = svg(
    shape('M16 78 Q16 90 30 90 L70 90 Q84 90 84 78 Z', 'ochre'), shape('M14 70 Q14 66 20 66 L80 66 Q86 66 86 70 Q86 76 80 76 L20 76 Q14 76 14 70 Z', 'brown'),
    poly([(18, 64), (82, 64), (74, 72), (60, 66), (44, 72), (30, 66)], 'yellow'),
    shape('M12 62 Q20 56 28 62 Q36 56 44 62 Q52 56 60 62 Q68 56 76 62 Q84 56 88 62 L84 66 L16 66 Z', 'greenSoft'),
    rect(20, 56, 60, 5, 'brick', 2.5, 2),
    shape('M14 56 Q14 22 50 20 Q86 22 86 56 Z', 'amber'), fill('M64 23 Q86 30 86 56 L70 56 Q74 36 64 23 Z', 'ochre'), ell(34, 36, 7, 4, 'yellow', 0, -30),
    *[ell(x, y, 2.4, 1.3, 'cream', 1.2, r) for x, y, r in [(40, 30, -20), (54, 28, 10), (64, 36, 30), (48, 40, 0), (30, 44, -10), (60, 46, 20)]],
)

D['fries'] = svg(
    *[rect(x, y, 7, 40, c, 1.5, 2.2, f'rotate({r} {x + 3.5} {y + 20})') for x, y, c, r in
      [(28, 12, 'amber', -14), (38, 6, 'yellow', -6), (48, 10, 'amber', 4), (58, 6, 'yellow', 10), (66, 14, 'amber', 16), (43, 14, 'yellow', 0), (54, 16, 'yellow', -4)]],
    shape('M22 44 L78 44 L70 94 L30 94 Z', 'brick'), fill('M62 44 L78 44 L70 94 L60 94 Q66 70 62 44 Z', 'brickDark'),
    shape('M22 44 Q50 54 78 44', 'brick', 2.5), poly([(50, 60), (60, 72), (50, 84), (40, 72)], 'yellow', 2), rect(28, 50, 4, 26, 'coral', 2, 0),
)

D['hotdog'] = svg(
    ell(50, 90, 44, 6, 'white'),
    shape('M10 66 Q10 52 24 52 L76 52 Q90 52 90 66 Q90 84 76 84 L24 84 Q10 84 10 66 Z', 'woodLight'),
    fill('M14 74 Q50 88 86 74 Q84 84 76 84 L24 84 Q16 84 14 74 Z', 'ochre'),
    shape('M6 60 Q6 50 16 50 L84 50 Q94 50 94 60 Q94 68 84 68 L16 68 Q6 68 6 60 Z', 'brick'), ell(30, 55, 10, 2, 'coral', 0),
    tube('M16 58 L24 54 L32 60 L40 54 L48 60 L56 54 L64 60 L72 54 L80 60', 'yellow', 2.5),
    shape('M14 62 Q14 42 30 42 L70 42 Q86 42 86 62 Q50 70 14 62 Z', 'woodLight').replace('<path', '<path opacity="0"'),
)

D['ice_cream'] = svg(
    shape('M30 50 L50 96 L70 50 Z', 'ochre'), line('M36 56 L58 84 M44 54 L62 72 M50 52 L66 60 M64 56 L42 84 M56 54 L38 70', 'woodLight', 1.6),
    out('M30 50 L50 96 L70 50 Z'), shape('M26 52 Q24 36 36 36 Q50 30 64 36 Q76 36 74 52 Q68 48 62 54 Q56 48 50 54 Q44 48 38 54 Q32 48 26 52 Z', 'peach'),
    shape('M30 36 Q28 18 50 16 Q72 18 70 36 Q64 32 58 38 Q50 32 42 38 Q36 32 30 36 Z', 'mint'), ell(40, 24, 5, 3, 'white', 0, -20),
    circle(50, 10, 6, 'brick'), tube('M51 4 Q54 -2 60 0', 'greenDark', 1.5), circle(48, 8, 1.6, 'coral', 0),
    *[rect(x, y, 4, 1.8, c, 0.8, 1, f'rotate({r} {x} {y})') for x, y, c, r in [(36, 44, 'yellow', 30), (56, 42, 'teal', -20), (46, 26, 'brick', 15), (60, 26, 'yellow', -30)]],
)

D['donut'] = svg(
    circle(50, 54, 40, 'wood'), circle(47.5, 51.5, 35, 'ochre', 0),
    shape('M14 50 Q14 18 50 16 Q86 18 86 50 Q84 64 78 60 Q74 74 64 66 Q58 78 50 70 Q42 80 36 68 Q26 76 22 62 Q14 64 14 50 Z', 'peach'),
    circle(50, 50, 12, 'paper'), ell(32, 30, 6, 3, 'white', 0, -30),
    *[rect(round(x, 1), round(y, 1), 5, 2, c, 1, 1, f'rotate({i * 47} {x:.1f} {y:.1f})') for i, ((x, y), c) in enumerate(zip(ring_pts(50, 46, 24, 12, 0.2), ['yellow', 'teal', 'white', 'brick'] * 3))],
)

D['cookie'] = svg(
    ell(48, 88, 36, 8, 'woodLight'), ell(48, 86, 32, 5.5, 'ochre', 0),
    circle(52, 50, 34, 'ochre'), circle(49.5, 47.5, 29.5, 'woodLight', 0),
    *[poly([(x, y - 4), (x + 4, y - 1), (x + 2.5, y + 4), (x - 2.5, y + 4), (x - 4, y - 1)], 'brownDark', 1.5) for x, y in [(40, 34), (60, 30), (66, 52), (44, 56), (54, 70), (34, 60), (52, 46)]],
    ell(34, 36, 3, 5, 'yellow', 0, 30),
)

def roll(x, y, w, h, c, r):
    return ell(x, y, w, h, c, 2.5, r)
D['croissant'] = svg(
    roll(18, 66, 10, 7, 'ochre', -50), roll(82, 66, 10, 7, 'ochre', 50),
    roll(28, 54, 14, 11, 'amber', -35), roll(72, 54, 14, 11, 'amber', 35), roll(50, 48, 18, 15, 'amber', 0),
    line('M36 44 Q40 54 36 64 M64 44 Q60 54 64 64', 'ochre', 2), ell(46, 42, 7, 3, 'yellow', 0, -10), ell(24, 50, 4, 2, 'yellow', 0, -35),
)

P = 'M10 60 Q10 34 44 34 Q78 34 78 60 Q78 86 44 86 Q10 86 10 60 Z'
D['fried_egg'] = svg(
    tube('M76 62 L96 56', 'ink', 4),
    fill(P, 'slate'), ell(44, 60, 28, 20, 'slateDark', 0), out(P),
    shape('M22 58 Q20 44 34 44 Q42 38 52 44 Q64 42 64 54 Q70 64 60 70 Q52 78 40 72 Q24 74 22 58 Z', 'white'),
    circle(42, 57, 9, 'amber'), ell(39, 54, 3, 2, 'yellow', 0, -30), ell(58, 72, 4, 2, 'greenSoft', 1.5, -20),
)

Bw = 'M10 52 Q12 86 42 92 L58 92 Q88 86 90 52 Z'
D['soup'] = svg(
    fill(Bw, 'white'), fill('M70 54 L90 52 Q88 86 58 92 L52 92 Q78 80 70 54 Z', 'paperShade'), rect(11, 62, 78, 7, 'brick', 0, 0), out(Bw),
    ell(50, 52, 40, 9, 'white'), ell(50, 52.5, 35, 6.5, 'coral', 0), ell(38, 52, 8, 2.5, 'white', 0),
    *[rect(x, 50, 4, 3, c, 1, 1.2) for x, c in [(54, 'amber'), (62, 'amber'), (46, 'greenSoft'), (70, 'green')]],
    tube('M76 52 L90 22', 'greyLight', 3), ell(91, 19, 4, 6, 'greyLight', 2, 25),
    tube('M40 40 C36 34 44 30 40 24', 'frost', 2.2), tube('M56 38 C52 32 60 28 56 22', 'frost', 2.2),
)

D['noodles'] = svg(
    tube('M42 52 L54 4', 'woodLight', 2.5), tube('M50 52 L64 6', 'woodLight', 2.5),
    *[tube(f'M{x} 52 Q{x + 4} 40 {x - 2} 30 Q{x + 6} 24 {x + 4} 18', c, 2) for x, c in [(44, 'yellow'), (50, 'cream'), (56, 'yellow')]],
    fill(Bw, 'teal'), fill('M70 54 L90 52 Q88 86 58 92 L52 92 Q78 80 70 54 Z', 'tealDark'), rect(11, 62, 78, 5, 'white', 0, 0), out(Bw),
    ell(50, 52, 40, 9, 'teal'), ell(50, 52.5, 35, 6.5, 'ochre', 0),
    ell(30, 50, 8, 5, 'white', 2), circle(30, 50, 3.5, 'amber', 0), *[circle(x, 51, 2, 'greenSoft', 1.2) for x in (64, 70, 60)],
)

def maki(x, y):
    return circle(x, y, 15, 'greenDark') + circle(x, y, 11, 'white', 0) + circle(x, y, 5, 'coral', 1.5) + circle(x + 3, y - 7, 1.5, 'paper', 0)
D['sushi'] = svg(
    rect(6, 76, 88, 12, 'woodLight', 2), rect(14, 88, 8, 6, 'wood', 1.5), rect(78, 88, 8, 6, 'wood', 1.5), line('M10 80 L90 80', 'ochre', 1.4),
    maki(24, 62), maki(52, 62),
    shape('M66 76 Q64 62 78 62 Q92 62 90 76 Z', 'white'), shape('M64 64 Q66 52 80 54 Q94 56 92 66 Q78 62 64 64 Z', 'coral'),
    line('M70 60 L72 56 M78 60 L80 56 M86 62 L88 58', 'peach', 2),
)

Bn = 'M14 28 Q8 66 42 82 Q66 90 86 72 Q72 74 56 68 Q30 56 24 26 Z'
D['banana'] = svg(
    fill(Bn, 'yellow'), fill('M86 72 Q66 90 42 82 Q60 80 74 72 Z', 'amber'), fill('M24 26 Q30 56 56 68 Q72 74 86 72 Q64 70 46 58 Q28 44 24 26 Z', 'amber'),
    out(Bn), rect(14, 20, 10, 9, 'brown', 2, 2, 'rotate(-10 19 24)'), rect(84, 68, 6, 6, 'brownDark', 1.5, 2, 'rotate(20 87 71)'),
    line('M20 40 Q22 58 36 70', 'ochre', 1.8), ell(18, 48, 2, 6, 'cream', 0, -10),
)

D['orange'] = svg(
    circle(56, 54, 32, 'ochre'), circle(53.5, 51.5, 27.5, 'amber', 0),
    *[circle(x, y, 0.9, 'ochre', 0) for x, y in [(44, 46), (52, 40), (60, 50), (48, 62), (66, 64), (58, 72), (70, 40)]],
    ell(44, 38, 5, 3, 'yellow', 0, -30), rect(54, 18, 5, 8, 'brown', 1.5, 2), shape('M58 22 Q70 10 82 16 Q72 28 58 22 Z', 'green'),
    circle(26, 76, 18, 'amber'), circle(26, 76, 14.5, 'yellow', 0), circle(26, 76, 3, 'cream', 0),
    *[line(f'M26 76 L{x:.1f} {y:.1f}', 'cream', 1.6) for x, y in ring_pts(26, 76, 14, 8)],
)

W = 'M10 30 Q50 22 90 30 L52 92 Q50 95 48 92 Z'
D['watermelon'] = svg(
    fill(W, 'coral'), fill('M64 28 Q80 28 90 30 L52 92 Q50 95 48 92 Z', 'brick'),
    shape('M8 26 Q50 14 92 26 Q92 34 88 34 Q50 26 12 34 Q8 34 8 26 Z', 'green'), line('M14 28 Q50 20 86 28', 'greenDark', 2),
    fill('M12 34 Q50 26 88 34 L86 38 Q50 30 14 38 Z', 'cream'), out(W),
    *[ell(x, y, 2, 3.2, 'ink', 0, r) for x, y, r in [(30, 46, -20), (46, 44, 0), (62, 46, 20), (40, 60, -10), (56, 60, 10), (48, 74, 0)]],
)

S = 'M50 92 Q20 70 20 46 Q20 30 36 30 Q44 30 50 34 Q56 30 64 30 Q80 30 80 46 Q80 70 50 92 Z'
D['strawberry'] = svg(
    fill(S, 'brick'), fill('M64 30 Q80 30 80 46 Q80 70 50 92 Q70 66 64 30 Z', 'brickDark'), ell(32, 48, 4, 8, 'coral', 0, 20), out(S),
    *[ell(x, y, 1.4, 2.2, 'yellow', 0) for x, y in [(36, 42), (50, 44), (64, 42), (42, 56), (58, 56), (34, 60), (66, 60), (50, 68), (44, 78), (56, 78)]],
    poly([(50, 36), (32, 30), (42, 26), (36, 18), (50, 24), (64, 18), (58, 26), (68, 30)], 'green'), tube('M50 24 L52 10', 'greenDark', 2.5),
)

D['chocolate'] = svg(
    rect(24, 8, 52, 50, 'brownDark', 3), *[rect(x, y, 20, 18, 'brown', 2, 2) for x in (28, 52) for y in (12, 34)],
    *[line(f'M{x + 3} {y + 3} L{x + 17} {y + 3}', 'wood', 1.6) for x in (28, 52) for y in (12, 34)],
    shape('M22 52 L30 56 L38 50 L46 56 L54 50 L62 56 L70 50 L78 54 L78 94 L22 94 Z', 'greyLight'),
    rect(22, 58, 56, 36, 'brick', 1, 2.5), rect(64, 59, 13, 34, 'brickDark', 0, 0), rect(32, 66, 36, 18, 'yellow', 2, 2), rect(40, 72, 20, 6, 'brick', 1.5, 0),
)

D['pancakes'] = svg(
    ell(50, 90, 44, 7, 'white'),
    *[shape(f'M14 {y} Q14 {y - 6} 50 {y - 6} Q86 {y - 6} 86 {y} Q86 {y + 7} 50 {y + 7} Q14 {y + 7} 14 {y} Z', c) for y, c in [(80, 'ochre'), (70, 'woodLight'), (60, 'ochre'), (50, 'woodLight'), (40, 'ochre')]],
    ell(50, 36, 34, 6, 'amber', 0), shape('M28 38 Q28 50 32 50 Q36 50 34 40 Z', 'amber', 2), shape('M66 40 Q68 58 72 56 Q74 54 72 40 Z', 'amber', 2),
    rect(40, 24, 18, 12, 'yellow', 2, 2, 'rotate(-6 49 30)'), circle(70, 32, 5, 'brick'), circle(32, 33, 4, 'brick'),
)

for k, v in D.items():
    save(k, v)
print(len(D), 'картинок')
