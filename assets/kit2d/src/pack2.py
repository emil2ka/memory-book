# Пачка 2 картинок: Казахстан.
from lib import *

D = {}
WRAP = lambda *b: svg(*b)

# кесе: пиала с чаем, бирюзовый узор
K = 'M16 52 Q18 82 40 88 L60 88 Q82 82 84 52 Z'
D['kese'] = svg(
    ell(50, 90, 14, 4, 'white'),
    fill(K, 'white'), fill('M66 54 L84 52 Q82 82 60 88 L54 88 Q72 78 66 54 Z', 'paperShade'),
    fill('M17.5 62 L82.5 62 Q81.5 68 79.5 72 L20.5 72 Q18.5 68 17.5 62 Z', 'teal'),
    ''.join(poly([(x, 64), (x + 3.2, 67), (x, 70), (x - 3.2, 67)], 'white', 0) for x in (26, 38, 50, 62, 74)),
    out(K), ell(50, 52, 34, 8, 'white'), ell(50, 52.5, 29, 5.5, 'ochre', 0), ell(42, 51.5, 10, 2, 'amber', 0),
    tube('M40 40 C36 34 44 30 40 24', 'frost', 2.2), tube('M58 42 C54 36 62 32 58 26', 'frost', 2.2),
)

D['baursak'] = svg(
    ell(50, 86, 42, 9, 'white'), ell(50, 85, 34, 6, 'teal', 0), ell(50, 84.5, 30, 5, 'white', 0),
    *[shape(f'M{x - 11} {y + 5} Q{x - 13} {y - 7} {x} {y - 9} Q{x + 13} {y - 7} {x + 11} {y + 5} Q{x} {y + 10} {x - 11} {y + 5} Z', c)
      + ell(x - 4, y - 3, 3.5, 2, 'yellow', 0, -20)
      for x, y, c in [(30, 76, 'ochre'), (50, 78, 'amber'), (70, 76, 'ochre'), (40, 62, 'amber'), (60, 62, 'ochre'), (50, 47, 'amber')]],
)

D['beshbarmak'] = svg(
    ell(50, 80, 46, 14, 'white'), ell(50, 79, 40, 11, 'teal', 0), ell(50, 78, 36, 9.5, 'white', 0),
    *[rect(x, y, 16, 9, c, 2, 2, f'rotate({r} {x + 8} {y + 4.5})') for x, y, c, r in [(16, 72, 'cream', -10), (34, 76, 'paper', 6), (56, 75, 'cream', -6), (68, 70, 'paper', 12), (26, 64, 'paper', 8), (58, 64, 'cream', -12)]],
    shape('M30 66 Q32 44 50 42 Q68 44 70 66 Q50 72 30 66 Z', 'wood'), fill('M58 45 Q68 48 70 66 Q62 68 58 68 Q64 58 58 45 Z', 'brown'),
    ell(42, 52, 6, 4, 'woodLight', 0), circle(36, 64, 5, 'brownDark'), circle(36, 64, 2, 'white', 0), circle(64, 64, 5, 'brownDark'), circle(64, 64, 2, 'white', 0),
    ell(46, 42, 4.5, 2.5, 'white', 1.8), ell(56, 40, 4, 2.2, 'white', 1.8), circle(50, 36, 3, 'greenSoft', 1.8),
    tube('M40 30 C36 24 44 20 40 14', 'frost', 2.2),
)

S = 'M14 82 L50 22 L86 82 Q50 90 14 82 Z'
D['samsa'] = svg(
    rect(8, 82, 84, 9, 'white', 2, 2, 'rotate(-3 50 86)'),
    fill(S, 'amber'), fill('M50 22 L86 82 Q72 85 60 86 Q66 60 50 22 Z', 'ochre'), fill('M24 76 Q50 82 76 76 L74 72 Q50 78 26 72 Z', 'woodLight'),
    out(S), line('M50 22 L50 86', 'ochre', 2), ell(40, 50, 3, 8, 'yellow', 0, 30),
    *[rect(x, y, 3, 1.8, 'cream', 0.8, 1, f'rotate({x * 7} {x} {y})') for x, y in [(44, 44), (56, 50), (40, 62), (60, 66), (50, 58), (48, 72), (34, 72), (64, 74)]],
)

D['tubeteika'] = svg(
    shape('M14 76 Q14 32 50 30 Q86 32 86 76 Z', 'brick'), fill('M64 33 Q86 40 86 76 L70 76 Q72 50 64 33 Z', 'brickDark'),
    rect(12, 70, 76, 14, 'yellow', 3), rect(66, 71, 21, 12, 'amber', 0, 0), line('M16 77 L84 77', 'ochre', 1.5),
    *[poly([(x, 44 + abs(x - 50) * 0.25), (x + 6, 52 + abs(x - 50) * 0.2), (x, 60), (x - 6, 52 + abs(x - 50) * 0.2)], 'yellow', 2) for x in (30, 50, 70)],
    *[circle(x, 52, 1.8, 'brick', 0) for x in (30, 50, 70)],
    ell(50, 22, 10, 9, 'white'), ell(46, 16, 6, 7, 'white'), ell(56, 15, 5, 7, 'cream'), rect(46, 27, 8, 4, 'yellow', 1, 2),
)

D['alatau'] = svg(
    poly([(2, 92), (30, 38), (58, 92)], 'greyBlue'), poly([(30, 38), (58, 92), (44, 92), (34, 50)], 'slate', 0), out('M2 92 L30 38 L58 92'),
    poly([(30, 38), (22.5, 52), (27, 49), (30, 55), (34, 49), (37.5, 52)], 'white', 2),
    poly([(36, 92), (64, 14), (96, 92)], 'slate'), poly([(64, 14), (96, 92), (80, 92), (68, 30)], 'slateDark', 0), out('M36 92 L64 14 L96 92'),
    poly([(64, 14), (55, 39), (60, 35), (64, 42), (68, 36), (73.5, 39)], 'white', 2),
    shape('M0 96 Q14 80 30 86 Q46 76 62 86 Q80 78 100 88 L100 96 Z', 'greenSoft'), fill('M62 86 Q80 78 100 88 L100 96 L66 96 Z', 'green'),
    *[poly([(x, 96 - 22), (x - 6, 96 - 4), (x + 6, 96 - 4)], 'greenDark', 2) + rect(x - 1.5, 92, 3, 4, 'brown', 0, 1.5) for x in (14, 24, 80)],
)

D['shanyrak'] = svg(
    circle(50, 52, 40, 'brown'), circle(47.5, 49.5, 35, 'wood', 0), circle(50, 52, 33, 'paper', 2.5),
    *[tube(f'M{50 + o} {52 - math.sqrt(33 ** 2 - o ** 2):.1f} L{50 + o} {52 + math.sqrt(33 ** 2 - o ** 2):.1f}', 'woodLight', 3.5) for o in (-12, 0, 12)],
    *[tube(f'M{50 - math.sqrt(33 ** 2 - o ** 2):.1f} {52 + o} L{50 + math.sqrt(33 ** 2 - o ** 2):.1f} {52 + o}', 'woodLight', 3.5) for o in (-12, 0, 12)],
    *[circle(round(x, 1), round(y, 1), 3, 'brick', 2) for x, y in ring_pts(50, 52, 36.5, 8)],
    circle(50, 52, 6, 'yellow'), ell(30, 30, 4, 7, 'woodLight', 0, 45),
)

D['kazan'] = svg(
    *[ell(x, 92, 7, 4.5, c) for x, c in [(16, 'grey'), (30, 'greyLight'), (70, 'greyLight'), (84, 'grey')]],
    shape('M38 92 Q42 74 50 70 Q58 74 62 92 Z', 'coral'), shape('M43 92 Q46 80 50 78 Q54 80 57 92 Z', 'yellow', 0),
    tube('M14 46 C2 46 2 62 14 62', 'slateDark', 3), tube('M86 46 C98 46 98 62 86 62', 'slateDark', 3),
    shape('M12 42 Q12 78 50 80 Q88 78 88 42 Z', 'slateDark'), fill('M70 44 L88 42 Q88 70 64 78 Q76 64 70 44 Z', 'navy'),
    ell(26, 54, 3, 8, 'slate', 0, 10), ell(50, 42, 40, 9, 'slate'), ell(50, 43, 33, 6, 'ochre', 0),
    *[rect(x, y, 6, 2.5, 'coral', 1, 1.2, f'rotate({x * 5} {x} {y})') for x, y in [(36, 41), (52, 44), (60, 40), (42, 45)]],
    ell(46, 41, 5, 1.5, 'amber', 0), tube('M44 30 C40 24 48 20 44 14', 'frost', 2.2), tube('M58 32 C54 26 62 22 58 16', 'frost', 2.2),
)

D['kurt'] = svg(
    ell(50, 90, 14, 4, 'tealDark'), shape('M14 60 Q16 86 50 88 Q84 86 86 60 Z', 'teal'), fill('M68 62 L86 60 Q84 84 56 88 Q74 78 68 62 Z', 'tealDark'),
    rect(14, 66, 72, 5, 'yellow', 0, 0), ell(50, 60, 36, 8, 'teal'),
    *[circle(x, y, 8, c) + circle(x - 2.5, y - 2.5, 2, 'white', 0) for x, y, c in [(30, 56, 'cream'), (46, 58, 'white'), (62, 56, 'cream'), (72, 60, 'white'), (38, 46, 'white'), (55, 44, 'cream'), (47, 32, 'white')]],
    circle(86, 88, 7, 'white'),
)

D['baiterek'] = svg(
    rect(30, 90, 40, 6, 'paperShade', 1.5), poly([(36, 90), (64, 90), (55, 50), (45, 50)], 'white'), poly([(52, 50), (55, 50), (64, 90), (56, 90)], 'paper', 0), out('M36 90 L45 50 L55 50 L64 90'),
    *[line(f'M{x} 88 L{50 + (x - 50) * 0.35:.1f} 52', 'greyLight', 1.3) for x in (42, 50, 58)],
    rect(46, 30, 8, 22, 'white', 1, 2),
    *[tube(f'M50 34 Q{50 + s * 10} 26 {50 + s * 17} 12', 'white', 2.2) for s in (-1, -0.45, 0.45, 1)],
    circle(50, 18, 12, 'amber'), fill('M57 8 A12 12 0 0 1 50 30 A10 10 0 0 0 57 8 Z', 'ochre'), circle(45, 13, 3.5, 'yellow', 0),
)

Sv = 'M30 62 Q24 36 50 34 Q76 36 70 62 Q68 74 60 76 L40 76 Q32 74 30 62 Z'
D['samovar'] = svg(
    *[ell(x, 92, 4, 3, 'ochre') for x in (36, 64)], poly([(38, 90), (62, 90), (58, 76), (42, 76)], 'ochre'),
    tube('M26 46 C16 46 16 58 28 58', 'ink', 1.5), tube('M74 46 C84 46 84 58 72 58', 'ink', 1.5),
    fill(Sv, 'amber'), fill('M60 36 Q76 40 70 62 Q68 74 60 76 L54 76 Q68 62 60 36 Z', 'ochre'), rect(29, 52, 42, 5, 'ochre', 0, 0),
    ell(38, 48, 3, 7, 'yellow', 0), out(Sv), rect(46, 62, 8, 6, 'ochre', 1, 2), rect(48, 68, 4, 6, 'ink', 1, 0),
    rect(42, 26, 16, 9, 'ochre', 2, 2),
    shape('M38 26 Q36 12 50 12 Q64 12 62 26 Z', 'white'), rect(37, 18, 26, 3.5, 'teal', 0, 0), out('M38 26 Q36 12 50 12 Q64 12 62 26'),
    tube('M62 20 L72 14', 'white', 2.5), circle(50, 10, 2.6, 'teal', 1.8),
)

T = 'M50 22 C72 22 84 40 84 60 C84 80 70 92 50 92 C30 92 16 80 16 60 C16 40 28 22 50 22 Z'
D['torsyk'] = svg(
    tube('M30 30 C20 6 80 6 70 30', 'brownDark', 3), rect(42, 10, 16, 14, 'brownDark', 2), rect(44, 4, 12, 8, 'woodLight', 2),
    fill(T, 'brown'), fill('M64 26 C80 34 84 48 84 60 C84 80 70 92 50 92 C70 82 76 56 64 26 Z', 'brownDark'), out(T),
    circle(50, 60, 22, 'wood', 2.2), circle(50, 60, 16, 'ochre', 0),
    poly([(50, 46), (62, 60), (50, 74), (38, 60)], 'yellow', 2), poly([(50, 53), (56, 60), (50, 67), (44, 60)], 'brick', 0),
    *[circle(x, y, 2.2, 'yellow', 1.5) for x, y in [(50, 36), (50, 84), (26, 60), (74, 60)]], ell(30, 44, 3, 6, 'woodLight', 0, 30),
)

D['horse'] = svg(
    *[rect(x, 64, 7, 26, c, 2, 2.5) for x, c in [(22, 'brown'), (30, 'wood'), (62, 'brown'), (70, 'wood')]],
    *[rect(x - 0.5, 88, 8, 6, 'ink', 1.5, 0) for x in (22, 30, 62, 70)],
    tube('M20 48 Q8 54 12 72', 'brownDark', 5),
    shape('M18 46 Q18 34 32 34 L68 34 Q82 34 82 48 Q82 66 68 68 L32 68 Q18 66 18 46 Z', 'wood'),
    fill('M24 58 Q50 70 78 58 Q78 66 68 68 L32 68 Q24 66 24 58 Z', 'brown'),
    shape('M64 40 L72 14 Q76 8 84 10 L94 18 Q98 24 92 28 L84 30 L80 44 Z', 'wood'),
    shape('M70 10 L68 2 L76 8 Z', 'wood', 2), shape('M76 8 Q66 14 64 38', 'brownDark', 2.5), fill('M66 16 Q62 26 63 38 L66 38 Q66 26 72 14 Z', 'brownDark'),
    ell(82, 16, 2, 2.6, 'ink', 0), circle(94, 23, 1.4, 'ink', 0),
    shape('M38 34 Q36 26 50 26 Q62 26 60 34 Z', 'brick'), rect(40, 34, 18, 16, 'brick', 2), rect(44, 38, 10, 8, 'yellow', 1, 1.8), poly([(49, 39), (52, 42), (49, 45), (46, 42)], 'brick', 0),
)

D['camel'] = svg(
    *[rect(x, 62, 6.5, 28, 'ochre', 2, 2.5) for x in (22, 30, 60, 68)], *[ell(x + 3.25, 91, 5.5, 3, 'woodLight') for x in (22, 30, 60, 68)],
    tube('M18 50 Q10 56 14 68', 'wood', 3),
    shape('M16 50 Q16 40 28 40 L72 40 Q84 42 82 54 Q80 66 68 66 L28 66 Q16 64 16 50 Z', 'ochre'),
    shape('M26 42 Q28 22 38 22 Q48 22 48 42 Z', 'ochre'), shape('M50 42 Q52 22 62 22 Q72 22 72 42 Z', 'ochre'),
    ell(34, 26, 5, 3, 'woodLight', 0), ell(58, 26, 5, 3, 'woodLight', 0),
    fill('M24 58 Q50 68 80 58 Q78 66 68 66 L28 66 Q24 64 24 58 Z', 'woodLight'),
    shape('M74 46 Q80 30 82 20 Q84 12 92 14 Q98 16 96 24 Q94 28 88 26 Q84 40 82 50 Z', 'ochre'),
    ell(90, 18, 1.8, 2.3, 'ink', 0), shape('M86 12 L86 8 L90 11 Z', 'ochre', 2), rect(40, 40, 10, 14, 'teal', 1.5, 2), rect(41, 48, 8, 3, 'brick', 0, 0),
)

D['berkut'] = svg(
    rect(16, 86, 68, 8, 'wood', 2), tube('M42 82 L42 88 M56 82 L56 88', 'yellow', 2),
    shape('M50 30 Q74 34 72 64 Q70 84 50 86 Q30 84 28 64 Q26 34 50 30 Z', 'brownDark'),
    shape('M50 44 Q62 48 60 66 Q58 80 50 80 Q42 80 40 66 Q38 48 50 44 Z', 'brown'),
    *[line(f'M{x} {y} Q50 {y + 3} {100 - x} {y}', 'wood', 1.6) for x, y in [(44, 56), (43, 64), (44, 72)]],
    shape('M28 46 Q12 64 22 86 L38 78 Q30 62 34 46 Z', 'brownDark'), shape('M72 46 Q88 64 78 86 L62 78 Q70 62 66 46 Z', 'brownDark'),
    line('M24 62 L32 70 M26 74 L34 78 M76 62 L68 70 M74 74 L66 78', 'brown', 1.8),
    shape('M50 10 Q66 10 66 26 Q66 38 50 38 Q34 38 34 26 Q34 10 50 10 Z', 'ochre'), fill('M56 12 Q66 14 66 26 Q66 36 56 38 Q62 26 56 12 Z', 'wood'),
    shape('M47 26 Q50 22 56 24 Q60 28 54 36 Q52 32 48 31 Z', 'yellow'),
    ell(42, 22, 2.4, 2.8, 'ink', 0), ell(58, 22, 2.4, 2.8, 'ink', 0), circle(42.8, 21, 0.9, 'white', 0), circle(58.8, 21, 0.9, 'white', 0),
)

def asyk(x, y, c, rot):
    return group(f'rotate({rot} {x} {y})', shape(f'M{x - 14} {y - 6} Q{x - 18} {y} {x - 14} {y + 6} L{x + 14} {y + 6} Q{x + 18} {y} {x + 14} {y - 6} Z', c),
                 ell(x - 4, y, 4, 3, 'paperShade' if c != 'brick' else 'brickDark', 0), ell(x + 6, y - 2, 3, 2, 'white', 0))
D['asyk'] = svg(asyk(28, 84, 'cream', -6), asyk(70, 86, 'paper', 8), asyk(48, 72, 'cream', -14), asyk(52, 56, 'brick', 4), rect(48, 50, 6, 6, 'yellow', 1, 1.8, 'rotate(45 51 53)'))

D['kobyz'] = svg(
    group('rotate(-12 50 55)',
          shape('M50 6 Q58 6 58 16 L56 40 L44 40 L42 16 Q42 6 50 6 Z', 'brown'), circle(50, 12, 3, 'brownDark', 2),
          shape('M30 50 Q30 38 50 38 Q70 38 70 50 L72 78 Q72 94 50 94 Q28 94 28 78 Z', 'brown'),
          shape('M36 52 Q36 46 50 46 Q64 46 64 52 L64 66 L36 66 Z', 'brownDark', 2), rect(37, 66, 26, 22, 'paperShade', 4, 2),
          line('M48 10 L48 84 M52 10 L52 84', 'cream', 1.2), rect(42, 76, 16, 3, 'brownDark', 1, 0),
          circle(34, 84, 2, 'ochre', 1.4), circle(66, 84, 2, 'ochre', 1.4)),
    tube('M80 14 Q92 50 80 88', 'woodLight', 3), line('M80 16 L80 86', 'cream', 1.6),
)

D['kalpak'] = svg(
    shape('M22 74 Q22 20 50 14 Q78 20 78 74 Z', 'white'), fill('M62 18 Q78 26 78 74 L66 74 Q68 40 62 18 Z', 'paper'),
    line('M50 14 L50 74 M36 22 Q32 48 32 74 M64 22 Q68 48 68 74', 'paperShade', 1.6),
    circle(50, 13, 3.5, 'ink', 0),
    shape('M12 70 Q14 92 34 88 L50 76 Z', 'ink'), shape('M88 70 Q86 92 66 88 L50 76 Z', 'ink'),
    shape('M15 70 Q18 86 33 84 L46 76 Q30 78 15 70 Z', 'white', 2), shape('M85 70 Q82 86 67 84 L54 76 Q70 78 85 70 Z', 'white', 2),
    rect(46, 70, 8, 8, 'brick', 1, 2, 'rotate(45 50 74)'), line('M24 80 L32 78 M76 80 L68 78', 'ink', 1.4),
)

D['nan'] = svg(
    circle(50, 52, 40, 'ochre'), circle(47.5, 49.5, 35, 'woodLight', 0),
    circle(50, 52, 24, 'paper', 2), circle(50, 52, 24, 'paper', 0),
    *[rect(round(x - 1.5, 1), round(y - 1.5, 1), 3, 3, 'brown', 1, 0) for x, y in ring_pts(50, 52, 14, 10) + ring_pts(50, 52, 6, 5) + [(50, 52)]],
    *[ell(round(x, 1), round(y, 1), 2.2, 1.2, 'cream', 0, i * 36) for i, (x, y) in enumerate(ring_pts(50, 52, 32, 10, 0.3))],
    ell(30, 32, 6, 3, 'yellow', 0, -40),
)

D['syrmak'] = svg(
    rect(12, 12, 76, 72, 'brick', 2), rect(17, 17, 66, 62, 'yellow', 1, 0), rect(21, 21, 58, 54, 'brick', 1, 2),
    *[tube(f'M{cx - 9} {cy + 6} Q{cx - 12} {cy - 8} {cx - 3} {cy - 8} Q{cx + 3} {cy - 6} {cx} {cy} M{cx + 9} {cy + 6} Q{cx + 12} {cy - 8} {cx + 3} {cy - 8} Q{cx - 3} {cy - 6} {cx} {cy}', c, 2.5)
      for cx, cy, c in [(36, 38, 'yellow'), (64, 38, 'yellow'), (36, 62, 'teal'), (64, 62, 'teal')]],
    poly([(50, 42), (58, 50), (50, 58), (42, 50)], 'white', 2),
    *[rect(x, 8, 4, 6, 'yellow', 1, 1.5) for x in range(16, 86, 9)],
    rect(10, 82, 80, 12, 'brickDark', 6), line('M16 88 L84 88', 'brick', 2),
)

D['dastarkhan'] = svg(
    rect(16, 72, 6, 22, 'brown', 1.5), rect(78, 72, 6, 22, 'brown', 1.5),
    ell(50, 68, 46, 12, 'wood'), ell(50, 66, 42, 9.5, 'white', 2), ell(50, 66, 42, 9.5, 'white', 0), line('M10 66 Q50 82 90 66', 'brick', 2.5),
    shape('M14 58 Q14 70 24 70 L32 70 Q40 70 40 58 Z', 'white', 2), fill('M15 60 L39 60 L38 64 L16 64 Z', 'teal'),
    *[circle(x, y, 4.5, c, 2) for x, y, c in [(20, 52, 'amber'), (28, 51, 'ochre'), (34, 54, 'amber'), (25, 45, 'ochre')]],
    shape('M44 60 Q42 40 56 40 Q70 40 68 60 Z', 'white'), rect(44, 48, 24, 4, 'teal', 0, 0), out('M44 60 Q42 40 56 40 Q70 40 68 60'),
    tube('M68 48 L78 40', 'white', 2.5), tube('M44 46 C36 46 36 56 44 56', 'white', 2), circle(56, 38, 3, 'teal', 1.8),
    ell(80, 62, 9, 3.5, 'white'), ell(80, 61, 6, 2, 'ochre', 0), ell(34, 70, 7, 3, 'white'), ell(34, 69, 5, 1.6, 'ochre', 0),
    tube('M54 32 C50 26 58 22 54 16', 'frost', 2),
)

D['saukele'] = svg(
    shape('M30 80 L40 18 Q50 8 60 18 L70 80 Z', 'white'), fill('M56 14 Q60 16 60 18 L70 80 L60 80 Q62 40 56 14 Z', 'paper'),
    rect(28, 74, 44, 14, 'brick', 2), *[circle(x, 81, 2.6, 'yellow', 1.5) for x in (34, 42, 50, 58, 66)],
    rect(34, 50, 32, 5, 'brick', 0, 2), rect(38, 32, 24, 4, 'brick', 0, 2),
    poly([(50, 56), (55, 62), (50, 68), (45, 62)], 'yellow', 2), poly([(50, 38), (53, 42), (50, 46), (47, 42)], 'yellow', 2),
    ell(50, 12, 7, 8, 'white'), ell(46, 6, 4, 6, 'cream'), ell(54, 5, 4, 6, 'white'),
    tube('M30 84 L24 94', 'amber', 2), tube('M70 84 L76 94', 'amber', 2), circle(24, 95, 2.5, 'yellow', 1.5), circle(76, 95, 2.5, 'yellow', 1.5),
)

for k, v in D.items():
    save(k, v)
print(len(D), 'картинок')
