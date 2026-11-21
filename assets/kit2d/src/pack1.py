# Пачка 1 картинок: предметы и pop-up каталога (те же id, что в библиотеке кита).
from lib import *

def blob(circles, c, hi=None, lo=None):
    """Облако из кругов с общим контуром (крона, облако, пена)."""
    s = ''.join(circle(x, y, r + 2.4, 'ink', 0) for x, y, r in circles)
    s += ''.join(circle(x, y, r, c, 0) for x, y, r in circles)
    if lo: s += ''.join(circle(x, y, r, lo, 0) for x, y, r in lo_c(circles))
    return s

def lo_c(circles):
    return []

D = {}

D['coffee'] = svg(
    ell(50, 89, 36, 7.5, 'white'), ell(50, 88.5, 22, 4, 'paperShade', 0),
    tube('M69 62 C82 61 82 79 66 79', 'white', 5),
    fill('M27 56 L31 83 Q33 90 42 90 L58 90 Q67 90 69 83 L73 56 Z', 'white'),
    fill('M62 58 L73 56 L69 83 Q67 90 58 90 L55 90 Q64 82 62 58 Z', 'paperShade'),
    poly([(28.6, 66), (71.4, 66), (70.5, 72), (29.5, 72)], 'teal', 0),
    poly([(62, 66), (71.4, 66), (70.5, 72), (62, 72)], 'tealDark', 0),
    rect(32, 60, 4, 18, 'white', 2, 0),
    out('M27 56 L31 83 Q33 90 42 90 L58 90 Q67 90 69 83 L73 56 Z'),
    ell(50, 56, 23, 5.5, 'white'), ell(50, 56.5, 19, 3.8, 'brownDark', 0),
    f'<path d="M45 55.5 C45 53.5 48 53.5 48 55.3 C48 53.5 51 53.5 51 55.5 C51 57 48 58.5 48 58.5 C48 58.5 45 57 45 55.5 Z" fill="{H["paper"]}"/>',
)

D['tea'] = svg(
    tube('M70 56 C84 55 84 77 69 77', 'white', 5),
    fill('M24 46 L24 82 Q24 94 36 94 L60 94 Q72 94 72 82 L72 46 Z', 'white'),
    fill('M60 48 L72 48 L72 82 Q72 94 60 94 L54 94 Q62 88 60 78 Z', 'paperShade'),
    rect(24, 72, 48, 7, 'greenSoft', 0, 0), rect(60, 72, 12, 7, 'green', 0, 0),
    rect(29, 52, 4.5, 16, 'white', 2.2, 0),
    out('M24 46 L24 82 Q24 94 36 94 L60 94 Q72 94 72 82 L72 46 Z'),
    ell(48, 46, 24, 6.5, 'white'), ell(48, 46.5, 20, 4.2, 'amber', 0), ell(42, 45.8, 7, 1.4, 'yellow', 0),
    line('M62 46 L66 56', 'ink', 1.6),
    rect(61, 55, 10, 10, 'yellow', 1.5, 2.2, 'rotate(10 66 60)'), line('M63 60 L69 61', 'ochre', 1.6),
    ell(32, 42, 9, 9, 'yellow', 2.5), ell(32, 42, 6, 6, 'cream', 0),
    line('M32 36 L32 48 M26.8 39 L37.2 45 M26.8 45 L37.2 39', 'yellow', 1.4),
)

D['cake'] = svg(
    ell(50, 89, 42, 7, 'white'),
    poly([(14, 52), (72, 52), (88, 42), (36, 38)], 'peach', 0),
    poly([(72, 52), (88, 42), (88, 78), (72, 88)], 'coral', 0),
    rect(14, 52, 58, 6, 'peach', 0, 0), rect(14, 58, 58, 11, 'woodLight', 0, 0), rect(14, 69, 58, 4, 'white', 0, 0),
    rect(14, 73, 58, 3, 'coral', 0, 0), rect(14, 76, 58, 12, 'woodLight', 0, 0),
    poly([(72, 58), (88, 48), (88, 78), (72, 88)], 'wood', 0), poly([(72, 52), (88, 42), (88, 48), (72, 58)], 'coral', 0),
    out('M14 52 L36 38 L88 42 L88 78 L72 88 L14 88 Z'), out('M14 52 L72 52 L88 42 M72 52 L72 88', 2),
    ell(58, 45, 9, 4, 'white'), ell(58, 39, 6, 6.5, 'brick'), ell(56, 37, 1.6, 2.2, 'coral', 0),
    poly([(58, 33), (52, 30), (56, 35), (60, 29), (59, 35), (64, 31)], 'green', 2),
    rect(18, 62, 3, 3, 'yellow', 0, 0), rect(40, 80, 3, 3, 'yellow', 0, 0), rect(60, 61, 3, 3, 'mint', 0, 0),
)

D['pizza'] = svg(
    shape('M22 30 Q50 22 78 30 L52 90 Q50 94 48 90 Z', 'yellow'),
    fill('M60 28 Q70 28 78 30 L52 90 Q50 94 49 92 Z', 'amber'),
    ell(51, 86, 3.5, 6, 'yellow', 2),
    shape('M15 26 Q50 12 85 26 Q86 34 79 35 Q50 24 21 35 Q14 34 15 26 Z', 'woodLight'),
    line('M24 27 Q50 19 76 27', 'ochre', 2),
    circle(40, 44, 6, 'brick'), circle(60, 46, 5.5, 'brick'), circle(50, 64, 5, 'brick'),
    circle(39, 43, 1.2, 'brickDark', 0), circle(42, 46, 1, 'brickDark', 0), circle(61, 45, 1.1, 'brickDark', 0), circle(51, 65, 1, 'brickDark', 0),
    ell(48, 52, 3.5, 2, 'green', 2, -30), ell(58, 58, 3, 1.8, 'green', 2, 30), ell(53, 76, 2.5, 1.6, 'green', 2, -10),
)

arms = ''.join(tube(f'M50 52 L{50 + 34 * math.sin(a):.1f} {52 - 34 * math.cos(a):.1f}', 'frost', 4.5) for a in [i * math.pi / 3 for i in range(6)])
branches = ''
for i in range(6):
    a = i * math.pi / 3
    bx, by = 50 + 21 * math.sin(a), 52 - 21 * math.cos(a)
    for s in (-1, 1):
        b = a + s * 0.75
        branches += tube(f'M{bx:.1f} {by:.1f} L{bx + 10 * math.sin(b):.1f} {by - 10 * math.cos(b):.1f}', 'ice', 3.5)
tips = ''.join(circle(round(50 + 35 * math.sin(a), 1), round(52 - 35 * math.cos(a), 1), 3.6, 'white', 2.2) for a in [i * math.pi / 3 for i in range(6)])
D['snowflake'] = svg(branches, arms, tips, poly(ring_pts(50, 52, 9, 6), 'white'), poly(ring_pts(50, 52, 4, 6, math.pi / 6), 'ice', 0))

Dp = 'M50 12 C58 32 77 48 77 66 C77 83 65 93 50 93 C35 93 23 83 23 66 C23 48 42 32 50 12 Z'
D['drop'] = svg(
    ell(50, 93, 32, 4.5, 'ice', 2),
    fill(Dp, 'ice'), fill('M60 34 C70 46 77 56 77 66 C77 83 65 93 50 93 C66 86 72 70 60 34 Z', 'greyBlue'),
    ell(36, 62, 4, 9, 'white', 0, 20), circle(39, 77, 2.2, 'white', 0), out(Dp), face(50, 68, 16, 2.4, 'peach'),
)

C = 'M62 12 A40 40 0 1 0 62 92 A50 50 0 0 1 62 12 Z'
D['moon'] = svg(
    fill(C, 'yellow'), fill('M62 12 A46 46 0 0 0 62 92 A50 50 0 0 1 62 12 Z', 'amber'),
    ell(30, 36, 3, 7, 'white', 0, 25), out(C),
    f'<path d="M25 50 Q29 53 33 50" fill="none"{st(2.2)}/>', ell(27, 58, 3.5, 2, 'coral', 0),
    f'<path d="M30 63 Q33 65 36 63" fill="none"{st(2)}/>',
    poly(star_pts(80, 30, 8, 3.5), 'cream', 2), poly(star_pts(84, 66, 5, 2.2), 'yellow', 2),
)

L = 'M50 84 C32 82 16 66 20 44 C23 28 38 14 50 8 C62 14 77 28 80 44 C84 66 68 82 50 84 Z'
D['leaf'] = group('rotate(-15 50 52)',
    tube('M50 84 L50 96', 'brown', 3),
    fill(L, 'amber'), fill('M50 8 C62 14 77 28 80 44 C84 66 68 82 50 84 Z', 'ochre'),
    out(L), line('M50 84 L50 18', 'brown', 2.2),
    line('M50 66 L32 54 M50 52 L34 40 M50 38 L40 28 M50 66 L68 54 M50 52 L66 40 M50 38 L60 28', 'brown', 1.6),
    ell(34, 62, 3, 5, 'yellow', 0, 30), circle(62, 66, 2.5, 'brick', 0),
).join(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" stroke-linejoin="round" stroke-linecap="round">\n', '\n</svg>\n'])

pet = ''.join(ell(round(50 + 13 * math.sin(a), 1), round(36 - 13 * math.cos(a), 1), 7, 10.5, 'peach' if i % 2 else 'coral', 2.2, round(math.degrees(a))) for i, a in enumerate([i * math.pi / 4 for i in range(8)]))
D['flower'] = svg(
    tube('M50 46 Q48 70 50 96', 'green', 3),
    shape('M49 76 Q34 62 24 70 Q34 84 49 80 Z', 'greenSoft'), shape('M51 66 Q66 52 76 60 Q66 74 51 70 Z', 'green'),
    pet, circle(50, 36, 8, 'amber'), circle(48, 34, 2, 'yellow', 0), circle(53, 39, 1.3, 'ochre', 0), circle(47, 39, 1.3, 'ochre', 0),
)

crown = [(50, 30, 21), (31, 44, 15), (69, 44, 15), (38, 56, 14), (62, 56, 14), (50, 48, 18)]
D['tree'] = svg(
    fill('M43 96 L46 60 L54 60 L57 96 Z', 'brown'), fill('M51 60 L54 60 L57 96 L52 96 Z', 'brownDark'),
    out('M43 96 L46 60 L54 60 L57 96 Z'), tube('M52 70 L62 60', 'brown', 3),
    ''.join(circle(x, y, r + 2.4, 'ink', 0) for x, y, r in crown), ''.join(circle(x, y, r, 'green', 0) for x, y, r in crown),
    circle(62, 58, 11, 'greenDark', 0), circle(70, 47, 9, 'greenDark', 0),
    circle(42, 26, 9, 'greenSoft', 0), circle(30, 41, 6, 'greenSoft', 0), circle(46, 22, 3.5, 'mint', 0),
    circle(36, 54, 3, 'brick'), circle(58, 40, 3, 'brick'), circle(66, 60, 3, 'brick'),
)

D['street_lamp'] = svg(
    ell(50, 93, 12, 3.5, 'slateDark'), rect(44, 84, 12, 9, 'slate', 1.5), rect(47.5, 36, 5, 50, 'slateDark', 1),
    rect(44, 56, 12, 4, 'slate', 1, 2),
    poly([(40, 34), (60, 34), (63, 16), (37, 16)], 'yellow'), poly([(52, 34), (60, 34), (63, 16), (55, 16)], 'amber', 0),
    out('M40 34 L60 34 L63 16 L37 16 Z'), line('M50 34 L50 16', 'slateDark', 2.4),
    poly([(33, 17), (67, 17), (50, 5)], 'slateDark'), circle(50, 4.5, 2.5, 'slate', 2), rect(38, 33, 24, 4, 'slateDark', 1, 2),
    ell(44, 24, 1.6, 4, 'white', 0),
)

D['lamp_post'] = svg(
    ell(50, 94, 10, 3, 'navy'), rect(45, 84, 10, 10, 'slateDark', 1.5), tube('M50 84 L50 22 Q50 10 62 10 Q72 10 72 20', 'slateDark', 3.5),
    rect(46, 50, 8, 4, 'slate', 1, 2), poly([(62, 26), (82, 26), (72, 18)], 'navy'), circle(72, 32, 7.5, 'yellow'),
    fill('M74 25 A7.5 7.5 0 0 1 74 39 A9 9 0 0 0 74 25 Z', 'amber'), circle(70, 30, 2, 'white', 0),
    tube('M54 70 Q60 72 58 78', 'slate', 2),
)

D['bench_small'] = svg(
    rect(20, 66, 4.5, 26, 'slateDark', 1), rect(75.5, 66, 4.5, 26, 'slateDark', 1),
    rect(28, 70, 4, 22, 'slateDark', 1), rect(68, 70, 4, 22, 'slateDark', 1),
    rect(16, 62, 68, 6, 'woodLight', 1.5), rect(18, 69, 64, 5, 'wood', 1.5),
    rect(18, 36, 64, 7, 'woodLight', 1.5), rect(18, 46, 64, 7, 'wood', 1.5),
    rect(22, 34, 4, 30, 'slateDark', 1), rect(74, 34, 4, 30, 'slateDark', 1),
    line('M30 64 L70 64', 'ochre', 1.4), line('M30 38 L70 38', 'ochre', 1.4),
)

D['bench'] = svg(
    ''.join(rect(x, 64, 4.5, 30, 'ink', 1) for x in (10, 85.5)), ''.join(rect(x, 68, 4, 26, 'ink', 1) for x in (18, 78)),
    rect(6, 60, 88, 6, 'woodLight', 1.5), rect(8, 67, 84, 5, 'wood', 1.5),
    rect(8, 32, 84, 7, 'woodLight', 1.5), rect(8, 42, 84, 7, 'wood', 1.5),
    rect(11, 28, 3.5, 34, 'ink', 1), rect(85.5, 28, 3.5, 34, 'ink', 1),
    tube('M7 52 Q4 46 12 44', 'ink', 2), tube('M93 52 Q96 46 88 44', 'ink', 2),
    line('M20 62 L80 62', 'ochre', 1.4), line('M20 34 L80 34', 'ochre', 1.4),
)

D['house'] = svg(
    rect(62, 16, 9, 22, 'brickDark', 1), rect(60, 13, 13, 5, 'brick', 1),
    rect(18, 50, 64, 45, 'cream', 0, 0), rect(64, 50, 18, 45, 'paperShade', 0, 0), out('M18 50 L18 95 L82 95 L82 50'),
    poly([(10, 54), (50, 18), (90, 54)], 'brick'), poly([(50, 18), (90, 54), (76, 54), (50, 30)], 'brickDark', 0), out('M10 54 L50 18 L90 54 Z'),
    circle(50, 40, 6, 'yellow'), line('M50 34 L50 46 M44 40 L56 40', 'white', 1.8),
    rect(26, 64, 15, 31, 'brown', 1.5), rect(28.5, 67, 10, 28, 'wood', 1, 0), circle(36, 81, 1.6, 'yellow', 1.2),
    rect(52, 62, 20, 17, 'yellow', 1.5), rect(52, 62, 20, 17, 'yellow', 1.5), line('M62 62 L62 79 M52 70.5 L72 70.5', 'white', 2.2),
    rect(50, 78, 24, 4, 'white', 1, 2),
    circle(82, 90, 8, 'green'), circle(76, 92, 6, 'greenSoft'), circle(84, 86, 2, 'coral', 0),
    rect(22, 94, 22, 3, 'grey', 1, 2),
)

D['cafe_table'] = svg(
    ''.join(rect(x, 58, 3.5, 36, 'slateDark', 1) for x in (6, 22)), rect(4, 30, 4, 32, 'slateDark', 1), rect(4, 54, 24, 6, 'brick', 1.5),
    ''.join(rect(x, 58, 3.5, 36, 'slateDark', 1) for x in (74.5, 90.5)), rect(92, 30, 4, 32, 'slateDark', 1), rect(72, 54, 24, 6, 'brick', 1.5),
    rect(48, 50, 4, 42, 'ink', 1), ell(50, 93, 12, 3, 'ink'),
    ell(50, 50, 24, 6, 'white'), rect(26, 50, 48, 3, 'paperShade', 0, 0), out('M26 50 L26 53 Q50 60 74 53 L74 50'),
    rect(38, 40, 9, 9, 'white', 1.5, 2), tube('M47 43 Q51 44 47 47', 'white', 1.2), ell(42.5, 40.5, 4.5, 1.4, 'brownDark', 0),
    rect(56, 38, 6, 11, 'ice', 1, 2), circle(59, 34, 4.5, 'coral'), circle(57.5, 32.5, 1.2, 'peach', 0),
)

D['candle'] = svg(
    ell(50, 90, 26, 6, 'amber'), ell(50, 88.5, 18, 3.5, 'ochre', 0), tube('M74 88 Q84 86 80 80', 'amber', 2.5),
    rect(38, 44, 24, 44, 'cream', 2, 0), rect(54, 44, 8, 44, 'paperShade', 0, 0), out('M38 88 L38 46 M62 46 L62 88'),
    ell(50, 45, 12, 3.5, 'white'), shape('M41 46 Q41 56 44 56 Q46 56 46 47', 'white', 2), shape('M57 46 Q57 52 59 52 Q61 52 61 46', 'white', 2),
    rect(42, 56, 3, 22, 'white', 1.5, 0), line('M50 44 L50 36', 'ink', 2.2),
    ell(50, 24, 13, 15, 'yellow', 0), shape('M50 10 C57 18 60 26 55 33 C52 37 48 37 45 33 C40 26 43 18 50 10 Z', 'amber'),
    shape('M50 18 C54 24 55 28 52 32 C50 34 48 33 47 31 C45 27 47 23 50 18 Z', 'yellow', 0),
)

bell = lambda cx: shape(f'M{cx - 9} 30 Q{cx - 9} 18 {cx} 18 Q{cx + 9} 18 {cx + 9} 30 Z', 'amber')
D['clock'] = svg(
    tube('M28 82 L22 93', 'ink', 2), tube('M72 82 L78 93', 'ink', 2),
    group('rotate(-20 30 26)', bell(30)), group('rotate(20 70 26)', bell(70)), rect(47, 16, 6, 10, 'ink', 1, 0), rect(42, 14, 16, 4, 'ink', 1, 0),
    circle(50, 58, 30, 'brick'), fill('M66 33 A30 30 0 0 1 58 87 A26 26 0 0 0 66 33 Z', 'brickDark'),
    circle(50, 58, 23, 'cream'), ''.join(rect(round(48.5 + 18 * math.sin(a), 1), round(56.5 - 18 * math.cos(a), 1), 3, 3, 'ink', 0.5, 0) for a in [i * math.pi / 6 for i in range(12)]),
    tube('M50 58 L50 42', 'ink', 1.5), tube('M50 58 L62 64', 'ink', 1.5), circle(50, 58, 3, 'brick', 2),
    ell(36, 44, 3, 6, 'white', 0, 40),
)

D['gift'] = svg(
    rect(18, 48, 64, 46, 'teal', 1.5), rect(64, 48, 18, 46, 'tealDark', 0, 0), out('M18 48 L18 94 L82 94 L82 48'),
    rect(14, 38, 72, 13, 'teal', 1.5), rect(68, 39, 17, 11, 'tealDark', 0, 0),
    rect(44, 38, 12, 56, 'yellow', 0, 2), rect(44, 38, 12, 56, 'yellow', 0, 2),
    shape('M50 38 C40 22 24 26 30 36 C34 40 44 40 50 38 Z', 'yellow'), shape('M50 38 C60 22 76 26 70 36 C66 40 56 40 50 38 Z', 'yellow'),
    shape('M50 38 C42 30 36 32 36 36', 'amber', 0), circle(50, 37, 5, 'amber'),
    rect(48, 38, 4, 56, 'amber', 0, 0), circle(30, 64, 3, 'mint', 0), circle(70, 80, 2.5, 'mint', 0), circle(28, 84, 2, 'white', 0),
)

D['laptop'] = svg(
    shape('M8 82 L78 82 L92 70 L24 70 Z', 'greyLight'), fill('M78 82 L92 70 L92 74 L80 86 Z', 'grey'), out('M8 82 L8 86 L80 86 L92 74 L92 70'),
    shape('M14 82 L80 82 L80 86 L8 86 L8 82', 'grey', 2),
    poly([(26, 78), (72, 78), (82, 72), (36, 72)], 'slate', 0), poly([(46, 80.5), (60, 80.5), (63, 79), (49, 79)], 'grey', 0),
    shape('M24 70 L30 20 L92 20 L92 70 Z', 'greyLight'), shape('M30 66 L35 25 L87 25 L87 66 Z', 'tealDark', 2),
    rect(40, 32, 26, 4, 'mint', 1, 0), rect(40, 40, 36, 3, 'ice', 1, 0), rect(40, 46, 20, 3, 'ice', 1, 0), rect(40, 52, 30, 3, 'teal', 1, 0),
    poly([(36, 30), (44, 30), (40, 60), (34, 60)], 'teal', 0),
)

D['phone'] = svg(
    rect(28, 8, 44, 86, 'navy', 7), rect(33, 16, 34, 66, 'tealDark', 3, 2), rect(44, 11, 12, 2.5, 'ink', 1, 0),
    ''.join(rect(37 + 9.5 * (i % 3), 21 + 10 * (i // 3), 7, 7, c, 2, 1.8) for i, c in enumerate(['coral', 'yellow', 'ice', 'peach', 'mint', 'amber'])),
    rect(37, 44, 26, 14, 'white', 2, 1.8), line('M41 49 L57 49 M41 53 L52 53', 'slate', 1.6),
    rect(42, 86, 16, 3, 'greyBlue', 1.5, 0), rect(71, 26, 3, 12, 'slate', 1, 1.8), fill('M60 16 L67 16 L67 30 Z', 'teal'),
)

D['book'] = svg(
    rect(24, 12, 50, 80, 'cream', 2), ''.join(line(f'M{x} 16 L{x} 88', 'paperShade', 1.2) for x in (70, 67)),
    rect(16, 10, 52, 84, 'brick', 3), rect(16, 10, 9, 84, 'brickDark', 2),
    rect(32, 24, 28, 13, 'yellow', 1.5, 2), line('M37 30.5 L55 30.5', 'ochre', 2),
    rect(33, 46, 26, 26, 'coral', 13, 2), ell(46, 59, 6, 6, 'yellow', 2), rect(30, 80, 32, 3, 'amber', 1, 0),
    rect(56, 88, 6, 10, 'teal', 0, 2),
)

D['backpack'] = svg(
    tube('M36 22 Q50 6 64 22', 'ink', 3), rect(20, 22, 60, 72, 'teal', 16), fill('M66 26 Q80 30 80 46 L80 80 Q80 94 66 94 Q74 86 72 60 Z', 'tealDark'),
    line('M26 42 Q50 34 74 42', 'tealDark', 2.4), rect(58, 34, 4, 9, 'yellow', 1, 2),
    rect(28, 58, 44, 30, 'tealDark', 6), rect(28, 56, 44, 9, 'teal', 3, 2), rect(52, 62, 4, 9, 'yellow', 1, 2),
    circle(36, 76, 5, 'coral'), circle(35, 75, 1.4, 'peach', 0), rect(26, 30, 4, 20, 'mint', 2, 0),
)

D['work_desk'] = svg(
    rect(8, 56, 84, 6, 'wood', 1.5), rect(8, 62, 84, 3, 'brown', 0, 2),
    rect(12, 62, 5, 32, 'brown', 1), rect(83, 62, 5, 32, 'brown', 1),
    rect(58, 64, 22, 22, 'woodLight', 1.5), rect(66, 68, 6, 2.5, 'ochre', 1, 1.5), rect(66, 78, 6, 2.5, 'ochre', 1, 1.5),
    shape('M28 56 L60 56 L64 52 L32 52 Z', 'greyLight', 2), shape('M32 52 L35 24 L64 24 L64 52 Z', 'greyLight'), rect(37, 28, 23, 20, 'tealDark', 1, 2),
    rect(40, 32, 12, 3, 'mint', 1, 0), rect(40, 38, 17, 2.5, 'ice', 1, 0),
    tube('M16 56 L16 34 L26 24', 'slateDark', 2), shape('M22 18 L34 22 L28 32 Z', 'amber'), ell(29, 29, 4, 3, 'yellow', 0),
    rect(70, 44, 9, 12, 'brick', 2), tube('M79 47 Q83 50 79 53', 'brick', 1.5), rect(10, 50, 12, 6, 'white', 1, 2),
)

def wheel(cx, cy):
    return (circle(cx, cy, 15, 'ink', 0) + circle(cx, cy, 11.5, 'paper', 0) + circle(cx, cy, 11.5, 'paper', 2) +
            ''.join(line(f'M{cx} {cy} L{cx + 11 * math.sin(a):.1f} {cy - 11 * math.cos(a):.1f}', 'grey', 1.3) for a in [i * math.pi / 4 for i in range(8)]) +
            circle(cx, cy, 2.5, 'grey', 1.5))
D['bicycle'] = svg(
    wheel(24, 76), wheel(76, 76),
    tube('M24 76 L42 76 L34 52 Z', 'coral', 3), tube('M42 76 L68 50 L34 52', 'coral', 3), tube('M76 76 L66 44', 'coral', 3),
    tube('M34 52 L32 44', 'grey', 2.5), shape('M24 42 L38 42 Q40 46 34 46 L26 46 Q22 46 24 42 Z', 'brownDark', 2),
    tube('M66 44 L64 36 L72 34', 'grey', 2.5), circle(42, 76, 4.5, 'grey', 2), line('M42 76 L46 82', 'ink', 2.5),
    shape('M70 30 L88 30 L86 44 L72 44 Z', 'woodLight'), line('M73 35 L85 35 M74 40 L84 40', 'wood', 1.4),
    circle(76, 27, 4, 'coral', 2), circle(82, 28, 3.5, 'greenSoft', 2),
)

D['car'] = svg(
    shape('M8 74 L8 62 Q8 54 16 53 L28 52 L38 36 Q41 32 47 32 L68 32 Q74 32 77 38 L84 52 Q92 54 92 62 L92 74 Q92 78 88 78 L12 78 Q8 78 8 74 Z', 'brick'),
    fill('M10 66 L90 66 L90 74 Q90 76 88 76 L12 76 Q10 76 10 74 Z', 'brickDark'),
    shape('M33 52 L41 38 Q43 36 47 36 L56 36 L56 52 Z', 'ice', 2), shape('M60 52 L60 36 L67 36 Q71 36 73 40 L79 52 Z', 'ice', 2),
    line('M44 48 L50 40 M64 48 L68 41', 'white', 2), line('M58 54 L58 74', 'ink', 1.8), rect(60, 57, 6, 2.5, 'brickDark', 1, 0),
    rect(85, 58, 6, 5, 'yellow', 1.5, 2), rect(9, 58, 5, 5, 'coral', 1.5, 2), rect(4, 70, 10, 5, 'greyLight', 2, 2), rect(86, 70, 10, 5, 'greyLight', 2, 2),
    circle(27, 78, 10, 'navy'), circle(27, 78, 4.5, 'greyLight', 2), circle(73, 78, 10, 'navy'), circle(73, 78, 4.5, 'greyLight', 2),
    rect(16, 56, 12, 3, 'coral', 1.5, 0),
)

pent = lambda cx, cy, r, rot=0: poly(ring_pts(cx, cy, r, 5, rot), 'ink', 0)
D['ball'] = svg(
    circle(50, 56, 38, 'white'), fill('M74 27 A38 38 0 0 1 56 93 A34 34 0 0 0 74 27 Z', 'greyLight'),
    pent(50, 56, 11), pent(50, 22, 7, math.pi), pent(18, 46, 7, 0.6), pent(82, 46, 7, -0.6), pent(28, 84, 7, 1.2), pent(72, 84, 7, -1.2),
    line('M50 45 L50 29 M39.5 52.6 L24 48 M60.5 52.6 L76 48 M43.5 64.9 L33 79 M56.5 64.9 L67 79', 'ink', 2),
    ell(34, 34, 5, 8, 'white', 0, 40), circle(50, 56, 38, 'white', 2.5).replace(f'fill="{H["white"]}"', 'fill="none"'),
)

D['note'] = svg(
    poly([(32, 20), (78, 12), (78, 24), (32, 32)], 'slateDark'), rect(30, 20, 5, 58, 'slateDark', 1.5), rect(73, 13, 5, 57, 'slateDark', 1.5),
    ell(24, 80, 12, 9, 'slateDark', 2.5, -20), ell(67, 72, 12, 9, 'slateDark', 2.5, -20),
    ell(20, 77, 4, 2, 'greyBlue', 0, -20), ell(63, 69, 4, 2, 'greyBlue', 0, -20), line('M38 24 L72 18', 'greyBlue', 2),
)

body = 'M50 44 C62 44 64 54 60 60 C72 64 76 76 70 86 C64 96 36 96 30 86 C24 76 28 64 40 60 C36 54 38 44 50 44 Z'
D['guitar'] = svg(
    rect(46, 10, 8, 50, 'brown', 1.5), ''.join(line(f'M46 {y} L54 {y}', 'greyLight', 1.4) for y in (22, 30, 38, 46)),
    shape('M44 4 L56 4 L57 14 L43 14 Z', 'brownDark'), ''.join(circle(x, y, 2, 'cream', 1.6) for x, y in [(40, 6), (40, 12), (60, 6), (60, 12)]),
    fill(body, 'woodLight'), fill('M58 46 C64 52 62 58 60 60 C72 64 76 76 70 86 C66 92 58 94 50 94 C64 88 70 70 58 46 Z', 'wood'),
    out(body), circle(50, 68, 6.5, 'brownDark'), ''.join(circle(round(50 + 9 * math.sin(a), 1), round(68 - 9 * math.cos(a), 1), 1.1, 'ochre', 0) for a in [i * math.pi / 6 for i in range(12)]),
    rect(42, 80, 16, 4, 'brownDark', 1, 0), line('M48.5 12 L48.5 82 M51.5 12 L51.5 82', 'cream', 1),
)

band = 'M18 60 C16 22 84 22 82 60'
D['headphones'] = svg(
    tube(band, 'slateDark', 7), line('M26 40 C34 24 66 24 74 40', 'greyBlue', 2),
    rect(10, 52, 20, 30, 'coral', 8), rect(70, 52, 20, 30, 'coral', 8), fill('M24 54 Q30 56 30 66 L30 74 Q30 82 22 82 Q28 74 24 54 Z', 'brick'),
    fill('M84 54 Q90 56 90 66 L90 74 Q90 82 82 82 Q88 74 84 54 Z', 'brick'), rect(24, 56, 8, 22, 'ink', 4, 0), rect(68, 56, 8, 22, 'ink', 4, 0),
    rect(13, 58, 3, 12, 'peach', 1.5, 0), rect(73, 58, 3, 12, 'peach', 1.5, 0),
)

head = 'M26 40 C26 24 74 24 74 40 C74 56 64 62 50 62 C36 62 26 56 26 40 Z'
D['dog'] = svg(
    tube('M66 84 Q80 80 78 66', 'woodLight', 4.5),
    shape('M30 95 C26 78 34 60 50 60 C66 60 74 78 70 95 Z', 'woodLight'), fill('M40 95 C38 82 44 72 50 72 C56 72 62 82 60 95 Z', 'cream'),
    ell(40, 93, 7, 4, 'cream'), ell(60, 93, 7, 4, 'cream'), rect(36, 60, 28, 5, 'brick', 2.5, 2), circle(50, 67, 3.2, 'yellow', 1.8),
    shape(head, 'woodLight'), fill('M62 28 C72 32 74 40 72 48 C70 56 64 60 58 61 C66 52 68 40 62 28 Z', 'wood'),
    shape('M28 30 C14 30 12 52 22 56 C28 56 30 44 30 36 Z', 'brown'), shape('M72 30 C86 30 88 52 78 56 C72 56 70 44 70 36 Z', 'brown'),
    ell(40, 30, 7, 5, 'brown', 0, -20), ell(50, 50, 10, 7, 'cream', 2), ell(50, 46, 4.5, 3, 'ink', 0), circle(48.6, 45, 1.1, 'white', 0),
    f'<path d="M50 49 L50 52 Q47 56 44 54 M50 52 Q53 56 56 54" fill="none"{st(1.8)}/>', ell(52, 56, 2.5, 3, 'coral', 1.6),
    ell(40, 40, 2.6, 3.4, 'ink', 0), ell(60, 40, 2.6, 3.4, 'ink', 0), circle(41, 38.8, 1, 'white', 0), circle(61, 38.8, 1, 'white', 0),
    ell(33, 50, 3.6, 2, 'coral', 0), ell(67, 50, 3.6, 2, 'coral', 0),
)

S = star_pts(50, 54, 42, 19)
D['star'] = svg(
    poly(S, 'yellow'), poly([(50, 54)] + star_pts(50, 54, 42, 19)[4:8] + [(50, 54)], 'amber', 0),
    poly(S, 'yellow').replace(f'fill="{H["yellow"]}"', 'fill="none"'), ell(38, 40, 3, 6, 'white', 0, 30), face(50, 56, 14, 2.6),
)

Hh = 'M50 88 C30 74 12 60 12 40 C12 26 22 18 33 18 C42 18 48 24 50 30 C52 24 58 18 67 18 C78 18 88 26 88 40 C88 60 70 74 50 88 Z'
D['heart'] = svg(
    fill(Hh, 'brick'), fill('M67 18 C78 18 88 26 88 40 C88 60 70 74 50 88 C64 72 80 56 78 40 C77 30 72 22 67 18 Z', 'brickDark'),
    ell(26, 36, 6, 9, 'coral', 0, 35), ell(24, 31, 2.5, 3.5, 'white', 0, 35), out(Hh),
)

for k, v in D.items():
    save(k, v)
print(len(D), 'картинок')
