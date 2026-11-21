# Пачка 4 картинок: погода, небо, природа.
from lib import *

D = {}

def puff(circles, c, shade=None, hi=None):
    s = ''.join(circle(x, y, r + 2.4, 'ink', 0) for x, y, r in circles) + ''.join(circle(x, y, r, c, 0) for x, y, r in circles)
    if shade: s += ''.join(circle(x, y, r, shade, 0) for x, y, r in shade_c(circles))
    return s

def shade_c(circles):
    return []

CL = [(30, 58, 16), (50, 48, 20), (70, 56, 16), (40, 66, 14), (60, 66, 14)]
D['cloud'] = svg(puff(CL, 'white'), ell(50, 72, 26, 5, 'frost', 0), ell(42, 40, 7, 4, 'white', 0, -20), face(50, 58, 16, 2.4, 'peach'))

RC = [(30, 40, 15), (50, 30, 19), (70, 38, 15), (40, 48, 13), (60, 48, 13)]
D['rain_cloud'] = svg(
    *[shape(f'M{x} {y} Q{x + 5} {y + 9} {x} {y + 11} Q{x - 5} {y + 9} {x} {y} Z', 'ice', 2) for x, y in [(30, 66), (46, 74), (62, 66), (38, 84), (56, 86), (72, 80)]],
    puff(RC, 'greyBlue'), ell(50, 54, 24, 4, 'slate', 0), ell(42, 22, 7, 3.5, 'ice', 0, -20),
    f'<path d="M42 40 Q45 37 48 40 M52 40 Q55 37 58 40" fill="none"{st(2)}/>', f'<path d="M46 47 Q50 44 54 47" fill="none"{st(2)}/>',
)

LB = 'M56 4 L24 54 L46 54 L36 96 L78 40 L54 40 L68 4 Z'
D['lightning'] = svg(fill(LB, 'yellow'), fill('M56 4 L68 4 L54 40 L78 40 L36 96 L60 44 L44 44 Z', 'amber'), out(LB), poly([(52, 14), (40, 40), (46, 40)], 'white', 0), poly(star_pts(20, 20, 7, 2.5), 'yellow', 1.8), poly(star_pts(84, 70, 6, 2.2), 'amber', 1.8))

arcs = ''.join(f'<path d="M{50 - r} 80 A{r} {r} 0 0 1 {50 + r} 80" fill="none" stroke="{INK}" stroke-width="{w + 5}"/><path d="M{50 - r} 80 A{r} {r} 0 0 1 {50 + r} 80" fill="none" stroke="{H[c]}" stroke-width="{w}"/>'
               for r, c, w in [(38, 'brick', 6), (31, 'amber', 6), (24, 'greenSoft', 6), (17, 'slate', 6)])
D['rainbow'] = svg(arcs, puff([(14, 82, 10), (24, 86, 8), (6, 88, 6)], 'white'), puff([(86, 82, 10), (76, 86, 8), (94, 88, 6)], 'white'))

D['snowman'] = svg(
    circle(50, 76, 20, 'white'), circle(50, 46, 15, 'white'), circle(50, 22, 12, 'white'), ell(44, 70, 5, 8, 'frost', 0, 20),
    tube('M36 44 L18 34 M22 36 L16 28', 'brown', 2), tube('M64 44 L82 34 M78 36 L86 30', 'brown', 2),
    rect(37, 30, 26, 6, 'brick', 3, 2), rect(56, 32, 6, 18, 'brick', 2, 2), line('M58 46 L62 46', 'brickDark', 1.5),
    *[circle(50, y, 2.2, 'ink', 0) for y in (44, 52, 70, 80)],
    rect(38, 6, 24, 4, 'slateDark', 1, 2), rect(42, -2, 16, 10, 'slateDark', 1.5, 2),
    ell(45, 21, 2, 2.5, 'ink', 0), ell(55, 21, 2, 2.5, 'ink', 0), poly([(50, 24), (64, 27), (50, 28)], 'coral', 2), ell(42, 27, 3, 1.7, 'peach', 0), ell(58, 27, 3, 1.7, 'peach', 0),
)

D['wind'] = svg(
    tube('M8 36 L58 36 Q72 36 72 26 Q72 16 62 16 Q54 16 56 24', 'frost', 4), tube('M18 54 L76 54 Q90 54 90 66 Q90 76 80 76 Q72 76 74 68', 'ice', 4),
    tube('M6 72 L46 72 Q56 72 56 80 Q56 88 48 88 Q42 88 44 82', 'frost', 4),
    shape('M78 30 Q86 20 94 26 Q88 36 78 30 Z', 'amber'), shape('M28 82 Q20 90 14 84 Q20 76 28 82 Z', 'coral'), shape('M30 22 Q38 14 44 20 Q36 28 30 22 Z', 'yellow'),
)

D['icicle'] = svg(
    *[shape(f'M{x - w} 26 L{x} {26 + h} L{x + w} 26 Z', c) for x, w, h, c in [(18, 7, 36, 'ice'), (34, 6, 56, 'frost'), (50, 7, 44, 'ice'), (66, 6, 62, 'frost'), (82, 7, 30, 'ice')]],
    *[line(f'M{x - 2} 30 L{x - 0.5} {26 + h * 0.6}', 'white', 2) for x, h in [(18, 36), (34, 56), (50, 44), (66, 62), (82, 30)]],
    shape('M6 26 Q6 14 18 14 L82 14 Q94 14 94 26 Z', 'white'), ell(66, 94, 3, 4, 'ice', 2),
)

D['thermometer'] = svg(
    rect(30, 6, 40, 88, 'woodLight', 6), rect(34, 10, 32, 80, 'cream', 4, 2),
    rect(44, 14, 12, 62, 'frost', 6), rect(47, 40, 6, 40, 'brick', 3, 0), circle(50, 80, 10, 'brick'), circle(47, 77, 2.5, 'coral', 0),
    *[line(f'M58 {y} L63 {y}', 'ink', 1.8) for y in (20, 30, 40, 50, 60)], *[line(f'M37 {y} L42 {y}', 'ink', 1.8) for y in (25, 45)],
)

D['fir'] = svg(
    rect(44, 82, 12, 14, 'brown', 1.5),
    *[poly([(50, y0), (50 - w, y1), (50 + w, y1)], 'green') + poly([(50, y0), (50 + w, y1), (50 + w * 0.3, y1)], 'greenDark', 0) for y0, y1, w in [(40, 86, 38), (22, 64, 30), (6, 42, 22)]],
    *[out(f'M50 {y0} L{50 - w} {y1} L{50 + w} {y1} Z') for y0, y1, w in [(22, 64, 30), (6, 42, 22)]],
    line('M34 78 L42 72 M30 56 L38 50 M40 34 L46 28', 'greenSoft', 2.5),
)

D['cactus'] = svg(
    shape('M30 70 L70 70 L64 96 L36 96 Z', 'coral'), fill('M58 70 L70 70 L64 96 L56 96 Z', 'brick'), rect(26, 64, 48, 10, 'brick', 2), ell(50, 66, 20, 3, 'brown', 0),
    rect(40, 14, 20, 54, 'green', 10), rect(44, 20, 4, 40, 'greenSoft', 2, 0),
    tube('M40 46 L28 46 L28 30', 'green', 6), tube('M60 40 L72 40 L72 24', 'green', 6),
    *[line(f'M{x} {y} L{x + 3} {y - 2}', 'cream', 1.4) for x, y in [(46, 28), (54, 36), (46, 50), (54, 58), (30, 36), (70, 30)]],
    circle(50, 12, 6, 'coral'), circle(50, 12, 2.5, 'yellow', 0),
)

D['mushroom'] = svg(
    shape('M38 56 L36 90 Q36 96 44 96 L56 96 Q64 96 64 90 L62 56 Z', 'cream'), fill('M54 56 L62 56 L64 90 Q64 96 56 96 L54 96 Q58 76 54 56 Z', 'paperShade'),
    shape('M10 58 Q10 16 50 14 Q90 16 90 58 Q50 66 10 58 Z', 'brick'), fill('M64 18 Q90 26 90 58 Q80 60 70 61 Q76 36 64 18 Z', 'brickDark'),
    *[ell(x, y, rx, ry, 'white', 2) for x, y, rx, ry in [(32, 34, 6, 4.5), (52, 26, 5, 4), (68, 40, 5.5, 4), (44, 48, 4, 3), (24, 50, 3.5, 2.5)]],
    tube('M22 96 L18 86 M26 96 L28 88 M76 96 L80 88', 'greenSoft', 2),
)

D['stone'] = svg(
    shape('M12 92 Q4 70 20 58 Q30 40 52 42 Q76 40 86 60 Q96 76 88 92 Z', 'grey'), fill('M66 44 Q84 50 88 64 Q96 78 88 92 L70 92 Q80 70 66 44 Z', 'ink').replace(H['ink'], H['grey']),
    fill('M18 62 Q30 46 52 46 Q40 60 26 66 Z', 'greyLight'),
    shape('M34 50 Q42 36 58 40 Q66 44 60 48 Q48 44 34 50 Z', 'greenSoft', 2), ell(84, 93, 9, 4, 'greyLight'), ell(14, 94, 7, 3, 'grey'),
    line('M40 70 L50 76 M60 64 L64 72', 'ink', 1.4),
)

pet = ''.join(ell(round(50 + 20 * math.sin(a), 1), round(34 - 20 * math.cos(a), 1), 6, 11, 'yellow' if i % 2 else 'amber', 2, round(math.degrees(a))) for i, a in enumerate([i * math.pi / 6 for i in range(12)]))
D['sunflower'] = svg(
    tube('M50 46 L50 96', 'green', 3.5), shape('M50 76 Q30 60 18 70 Q30 86 50 80 Z', 'greenSoft'), shape('M50 66 Q70 50 82 60 Q70 76 50 70 Z', 'green'),
    pet, circle(50, 34, 14, 'brown'), circle(50, 34, 9, 'brownDark', 0), *[circle(round(x, 1), round(y, 1), 1.2, 'ochre', 0) for x, y in ring_pts(50, 34, 11.5, 12)],
)

D['tulip'] = svg(
    tube('M50 50 L50 96', 'green', 3), shape('M48 96 Q26 80 28 54 Q42 66 48 86 Z', 'greenSoft'), shape('M52 96 Q74 76 70 58 Q58 72 52 86 Z', 'green'),
    shape('M30 22 L40 32 L50 14 L60 32 L70 22 Q74 52 50 56 Q26 52 30 22 Z', 'brick'), fill('M50 14 L60 32 L70 22 Q74 52 50 56 Q62 40 50 14 Z', 'brickDark'),
    shape('M40 32 Q44 50 50 56 Q38 52 34 40 Z', 'coral', 0), ell(36, 34, 2.5, 6, 'peach', 0, 10),
)

D['rose'] = svg(
    tube('M50 54 L50 96', 'greenDark', 3), poly([(50, 70), (44, 66), (50, 66)], 'greenDark', 1.5), poly([(50, 82), (56, 78), (50, 78)], 'greenDark', 1.5),
    shape('M50 76 Q30 70 26 80 Q38 90 50 82 Z', 'green'), shape('M50 64 Q70 56 74 66 Q62 76 50 70 Z', 'greenSoft'),
    shape('M50 56 Q24 54 24 34 Q24 16 50 14 Q76 16 76 34 Q76 54 50 56 Z', 'brick'), fill('M62 18 Q76 22 76 34 Q76 54 50 56 Q70 44 62 18 Z', 'brickDark'),
    f'<path d="M50 28 Q38 30 40 38 Q44 46 54 42 Q62 36 56 28 Q50 22 42 26 M34 32 Q32 46 46 50 M62 22 Q70 34 62 46" fill="none"{st(2)}/>',
    poly([(44, 56), (50, 50), (56, 56), (50, 60)], 'green', 2),
)

D['blossom'] = svg(
    tube('M30 96 Q36 70 50 56 Q60 44 78 36', 'brown', 4), tube('M46 62 Q34 50 22 46', 'brown', 3), tube('M60 46 Q60 30 54 20', 'brown', 3),
    *[''.join(ell(round(x + 6 * math.sin(a), 1), round(y - 6 * math.cos(a), 1), 4, 5, c, 1.8, round(math.degrees(a))) for a in [i * 2 * math.pi / 5 for i in range(5)])
      + circle(x, y, 2.4, 'coral', 1.2) for x, y, c in [(78, 34, 'white'), (22, 44, 'peach'), (54, 18, 'white'), (40, 34, 'peach'), (66, 56, 'white'), (30, 64, 'white')]],
    ell(70, 46, 5, 2.5, 'greenSoft', 1.8, -30), ell(36, 52, 5, 2.5, 'greenSoft', 1.8, 30),
)

D['pumpkin'] = svg(
    tube('M50 30 Q50 16 58 12', 'brown', 4), shape('M56 20 Q70 8 82 16 Q72 28 56 20 Z', 'green'),
    ell(28, 62, 18, 30, 'ochre'), ell(72, 62, 18, 30, 'ochre'), ell(38, 62, 16, 31, 'amber'), ell(62, 62, 16, 31, 'amber'), ell(50, 62, 14, 32, 'amber'),
    ell(40, 46, 3, 9, 'yellow', 0, 10), fill('M76 40 Q88 50 86 66 Q84 84 70 90 Q82 70 76 40 Z', 'ochre'),
)

D['campfire'] = svg(
    *[ell(x, 90, 8, 5, c) for x, c in [(12, 'grey'), (28, 'greyLight'), (72, 'greyLight'), (88, 'grey')]],
    rect(18, 76, 64, 9, 'brown', 4, 2.5, 'rotate(-14 50 80)'), rect(18, 76, 64, 9, 'wood', 4, 2.5, 'rotate(14 50 80)'), circle(20, 86, 3, 'woodLight', 1.5), circle(80, 86, 3, 'woodLight', 1.5),
    shape('M50 8 Q72 36 70 58 Q68 78 50 80 Q32 78 30 58 Q28 40 42 26 Q42 40 48 42 Q44 26 50 8 Z', 'coral'),
    shape('M52 28 Q66 46 62 62 Q58 76 50 76 Q40 74 40 62 Q40 50 48 44 Q50 54 54 52 Q56 40 52 28 Z', 'amber', 0),
    shape('M50 52 Q58 60 56 68 Q54 74 50 74 Q44 72 45 66 Q46 60 50 52 Z', 'yellow', 0),
)

D['tent'] = svg(
    shape('M4 90 L46 20 L88 90 Z', 'coral'), poly([(46, 20), (88, 90), (96, 82), (60, 16)], 'brick'), out('M46 20 L60 16 L96 82 L88 90'),
    poly([(46, 20), (30, 90), (62, 90)], 'brickDark'), poly([(46, 30), (40, 90), (36, 90)], 'peach', 0), out('M46 20 L30 90 M46 20 L62 90'),
    tube('M46 20 L46 6', 'brown', 2), poly([(47, 6), (60, 10), (47, 14)], 'yellow', 2),
    rect(0, 90, 100, 6, 'greenSoft', 2, 2), line('M4 90 L0 96 M96 82 L100 94', 'paperShade', 1.6),
)

D['wave'] = svg(
    shape('M4 94 Q4 70 20 54 Q34 22 66 18 Q90 18 94 36 Q86 30 76 34 Q62 40 66 56 Q70 70 88 66 Q96 64 96 60 L96 94 Z', 'teal'),
    fill('M20 94 Q18 76 30 62 Q40 48 50 56 Q46 72 60 94 Z', 'tealDark'),
    shape('M60 22 Q80 14 94 36 Q86 30 76 34 Q64 38 64 50 Q56 40 60 22 Z', 'white'), puff([(88, 34, 5), (78, 30, 5), (68, 24, 5)], 'white'),
    line('M14 82 Q24 74 34 80 M70 80 Q80 74 90 80', 'ice', 2.5), circle(30, 46, 3, 'white', 2), circle(40, 36, 2, 'white', 1.6),
)

D['seashell'] = svg(
    *[shape(f'M50 86 L{50 + 40 * math.sin(a):.1f} {80 - 40 * math.cos(a):.1f} A12 12 0 0 1 {50 + 40 * math.sin(a + 0.34):.1f} {80 - 40 * math.cos(a + 0.34):.1f} Z', 'peach' if i % 2 else 'coral', 2.2)
      for i, a in enumerate([-1.36 + i * 0.34 for i in range(8)])],
    shape('M38 84 L62 84 L58 94 L42 94 Z', 'coral'), ell(40, 40, 2.5, 5, 'white', 0, -20),
)

D['sprout'] = svg(
    shape('M30 64 L70 64 L64 96 L36 96 Z', 'coral'), fill('M58 64 L70 64 L64 96 L56 96 Z', 'brick'), rect(26, 58, 48, 10, 'brick', 2), ell(50, 60, 20, 3, 'brown', 0),
    tube('M50 60 Q48 46 52 34', 'green', 3), shape('M52 36 Q62 18 82 22 Q76 42 52 36 Z', 'greenSoft'), shape('M50 44 Q40 28 20 32 Q28 50 50 44 Z', 'greenSoft'),
    line('M54 34 Q66 28 76 25 M48 42 Q36 36 26 34', 'green', 1.6), ell(36, 78, 3, 5, 'peach', 0),
)

BU = [(26, 70, 18), (50, 58, 22), (74, 70, 18), (38, 80, 14), (62, 80, 14)]
D['bush'] = svg(puff(BU, 'green'), circle(68, 74, 12, 'greenDark', 0), circle(42, 50, 8, 'greenSoft', 0), circle(24, 64, 6, 'greenSoft', 0),
                *[circle(x, y, 3.5, c) for x, y, c in [(34, 66, 'brick'), (58, 52, 'coral'), (70, 70, 'brick'), (48, 80, 'coral'), (20, 78, 'brick')]],
                rect(0, 92, 100, 4, 'greenDark', 2, 0))

D['palm'] = svg(
    ell(48, 92, 26, 5, 'paper'),
    *[rect(36 + i * 1.6, 82 - i * 11, 14, 12, 'woodLight' if i % 2 else 'ochre', 3, 2.2, f'rotate({8 - i * 3} {43 + i * 1.6} {88 - i * 11})') for i in range(6)],
    *[shape(d, c) for d, c in [('M54 24 Q30 6 8 28 Q30 22 54 28 Z', 'green'), ('M54 24 Q80 6 96 30 Q76 22 54 28 Z', 'green'), ('M54 26 Q34 30 20 52 Q40 36 56 30 Z', 'greenSoft'),
                               ('M54 26 Q76 32 86 54 Q68 38 54 30 Z', 'greenSoft'), ('M54 24 Q52 4 66 0 Q62 14 56 26 Z', 'greenSoft')]],
    circle(48, 32, 5, 'brown'), circle(58, 33, 5, 'brown'), circle(53, 37, 5, 'brownDark'),
)

BC = [(50, 22, 18), (32, 36, 14), (68, 36, 14), (40, 48, 12), (60, 48, 12)]
D['birch'] = svg(
    rect(44, 40, 12, 56, 'white', 2), rect(52, 40, 4, 56, 'greyLight', 0, 0), out('M44 96 L44 40 M56 40 L56 96'),
    *[rect(x, y, w, 3, 'ink', 1, 0) for x, y, w in [(44, 52, 5), (51, 62, 5), (44, 72, 6), (50, 82, 6), (45, 90, 4)]],
    tube('M56 56 L66 48', 'white', 2.5), puff(BC, 'greenSoft'), circle(64, 42, 10, 'green', 0), circle(42, 16, 7, 'mint', 0), circle(28, 32, 4, 'mint', 0),
)

D['crystal'] = svg(
    ell(50, 92, 30, 5, 'slateDark'),
    poly([(40, 90), (38, 34), (50, 16), (62, 34), (60, 90)], 'ice'), poly([(50, 16), (62, 34), (60, 90), (50, 90)], 'greyBlue', 0), out('M40 90 L38 34 L50 16 L62 34 L60 90'), line('M50 16 L50 90', 'frost', 2),
    poly([(22, 90), (18, 56), (26, 44), (34, 56), (36, 90)], 'mauve'), poly([(26, 44), (34, 56), (36, 90), (28, 90)], 'plum', 0), out('M22 90 L18 56 L26 44 L34 56 L36 90'),
    poly([(64, 90), (66, 62), (74, 52), (82, 62), (80, 90)], 'teal'), poly([(74, 52), (82, 62), (80, 90), (74, 90)], 'tealDark', 0), out('M64 90 L66 62 L74 52 L82 62 L80 90'),
    rect(43, 40, 3, 30, 'white', 1.5, 0), poly(star_pts(80, 26, 6, 2), 'yellow', 1.6), poly(star_pts(18, 36, 4, 1.5), 'white', 1.4),
)

for k, v in D.items():
    save(k, v)
print(len(D), 'картинок')
