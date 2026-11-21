# Пачка 8 картинок: праздники и чувства-символы.
from lib import *

item('new_year_tree', 'holiday', 'новогодняя ёлка', 'шырша', 'new year tree', ['новогодн', 'новый год', 'нового года', 'ёлк', 'елк', 'жаңа жыл', 'christmas'], ['holiday', 'winter', 'joy', 'family', 'night'], 'ground', svg(
    rect(42, 82, 16, 12, 'brown', 1.5), rect(34, 88, 32, 8, 'brick', 2),
    *[poly([(50, y0), (50 - w, y1), (50 + w, y1)], 'green') for y0, y1, w in [(40, 84, 36), (22, 64, 28), (8, 44, 20)]],
    line('M22 76 Q50 66 80 72 M28 56 Q50 48 72 54 M36 38 Q50 32 64 36', 'yellow', 2.5),
    *[circle(x, y, 3.6, c, 2) for x, y, c in [(30, 78, 'brick'), (58, 76, 'teal'), (74, 78, 'amber'), (40, 58, 'amber'), (62, 56, 'brick'), (46, 40, 'teal'), (56, 34, 'coral')]],
    poly(star_pts(50, 8, 9, 4), 'yellow', 2)), fx=['sparkle'])

item('firework', 'holiday', 'салют', 'отшашу', 'fireworks', ['салют', 'фейерверк', 'отшашу', 'firework'], ['holiday', 'night', 'joy', 'energy', 'sky'], 'both', svg(
    *[tube(f'M50 52 L{50 + 34 * math.sin(a):.1f} {52 - 34 * math.cos(a):.1f}', c, 3) for a, c in zip([i * math.pi / 6 for i in range(12)], ['yellow', 'coral', 'teal', 'amber'] * 3)],
    *[circle(round(50 + 38 * math.sin(a), 1), round(52 - 38 * math.cos(a), 1), 3.5, c, 1.6) for a, c in zip([i * math.pi / 6 for i in range(12)], ['yellow', 'coral', 'teal', 'amber'] * 3)],
    circle(50, 52, 7, 'white'), poly(star_pts(18, 18, 5, 2), 'yellow', 1.4), poly(star_pts(84, 84, 5, 2), 'white', 1.4)), fx=['sparkle'])

item('party_hat', 'holiday', 'праздничный колпак', 'мереке қалпағы', 'party hat', ['колпак', 'вечеринк', 'праздник', 'тусовк', 'мереке', 'party'], ['holiday', 'birthday', 'joy', 'friends'], 'hand', svg(
    shape('M50 8 L82 86 Q50 96 18 86 Z', 'teal'), fill('M50 8 L82 86 Q70 90 62 91 Q60 50 50 8 Z', 'tealDark'),
    line('M36 44 L64 44 M28 64 L72 64', 'yellow', 4), *[circle(x, y, 2.5, 'coral', 0) for x, y in [(44, 32), (56, 54), (40, 76), (64, 78)]],
    out('M50 8 L82 86 Q50 96 18 86 Z'), circle(50, 8, 7, 'yellow'), shape('M16 86 Q50 98 84 86 L86 92 Q50 104 14 92 Z', 'white', 2)))

item('candy', 'holiday', 'конфета', 'кәмпит', 'candy', ['конфет', 'сладост', 'сладк', 'кәмпит', 'тәтті', 'candy', 'sweet'], ['holiday', 'sweet', 'food', 'joy', 'childhood'], 'hand', svg(
    shape('M30 50 L8 32 L10 68 Z', 'peach'), shape('M70 50 L92 32 L90 68 Z', 'peach'), line('M12 40 L24 48 M12 60 L24 52 M88 40 L76 48 M88 60 L76 52', 'coral', 2),
    ell(50, 50, 24, 18, 'brick'), *[line(f'M{x} 33 Q{x + 8} 50 {x} 67', 'white', 3) for x in (38, 50, 62)], ell(50, 50, 24, 18, 'brick').replace(f'fill="{H["brick"]}"', 'fill="none"'),
    ell(40, 40, 5, 3, 'peach', 0, -20)))

item('lollipop', 'holiday', 'леденец', 'кәмпит таяқша', 'lollipop', ['леденец', 'леденц', 'чупа', 'петушок', 'lollipop'], ['sweet', 'holiday', 'childhood', 'joy'], 'hand', svg(
    tube('M50 58 L50 96', 'white', 3), circle(50, 34, 28, 'coral'),
    f'<path d="M50 34 Q50 26 58 28 Q66 34 60 42 Q50 50 40 42 Q32 30 42 20 Q56 10 70 22 Q80 36 72 50" fill="none" stroke="{H["white"]}" stroke-width="4"/>',
    circle(50, 34, 28, 'coral').replace(f'fill="{H["coral"]}"', 'fill="none"'), shape('M42 60 L50 66 L58 60 L56 70 L50 66 L44 70 Z', 'teal', 2)))

item('medal', 'holiday', 'медаль', 'медаль', 'medal', ['медал', 'награ', 'грамот', 'диплом', 'марапат', 'medal', 'award'], ['sport', 'joy', 'study', 'holiday', 'energy'], 'hand', svg(
    poly([(30, 4), (46, 4), (56, 44), (44, 48)], 'brick'), poly([(70, 4), (54, 4), (44, 44), (56, 48)], 'teal'),
    circle(50, 66, 26, 'amber'), circle(50, 66, 18, 'yellow', 2), poly(star_pts(50, 66, 11, 5), 'amber', 2), ell(38, 56, 3, 6, 'white', 0, 30)), fx=['sparkle'])

item('crown', 'holiday', 'корона', 'тәж', 'crown', ['корон', 'королев', 'принцесс', 'тәж', 'crown', 'queen', 'king'], ['holiday', 'joy', 'dream', 'symbol'], 'hand', svg(
    shape('M10 34 L28 56 L50 20 L72 56 L90 34 L82 82 L18 82 Z', 'amber'), fill('M72 56 L90 34 L82 82 L64 82 Q74 64 72 56 Z', 'ochre'), out('M10 34 L28 56 L50 20 L72 56 L90 34 L82 82 L18 82 Z'),
    rect(18, 70, 64, 12, 'yellow', 1, 2), *[circle(x, 76, 3.5, c, 1.8) for x, c in [(32, 'brick'), (50, 'teal'), (68, 'brick')]],
    *[circle(x, y, 4, 'white', 2) for x, y in [(10, 32), (50, 18), (90, 32)]]))

item('ring', 'holiday', 'кольцо', 'сақина', 'ring', ['кольц', 'помолвк', 'предложени', 'сақина', 'ring'], ['love', 'holiday', 'symbol', 'joy'], 'hand', svg(
    circle(50, 64, 28, 'amber'), circle(50, 64, 18, 'paper'), fill('M70 44 A28 28 0 0 1 56 91 A26 26 0 0 0 70 44 Z', 'ochre'),
    poly([(36, 34), (64, 34), (72, 24), (50, 6), (28, 24)], 'ice'), poly([(50, 6), (72, 24), (64, 34), (50, 34)], 'greyBlue', 0), out('M36 34 L64 34 L72 24 L50 6 L28 24 Z'),
    line('M28 24 L72 24 M50 6 L42 24 L50 34 L58 24 L50 6', 'frost', 1.6), poly(star_pts(80, 14, 5, 2), 'white', 1.4)), fx=['sparkle'])

item('nauryz_kozhe', 'kz', 'наурыз-көже', 'наурыз көже', 'nauryz kozhe', ['наурыз', 'көже', 'коже$', 'nauryz'], ['kz', 'holiday', 'food', 'spring', 'family', 'guests'], 'both', svg(
    ell(50, 90, 16, 4, 'white'), shape('M12 52 Q14 86 42 90 L58 90 Q86 86 88 52 Z', 'white'), fill('M70 54 L88 52 Q86 86 58 90 L52 90 Q76 80 70 54 Z', 'paperShade'),
    rect(13, 62, 74, 6, 'brick', 0, 0), *[poly([(x, 62.5), (x + 3, 65), (x, 67.5), (x - 3, 65)], 'yellow', 0) for x in (24, 38, 50, 62, 76)], out('M12 52 Q14 86 42 90 L58 90 Q86 86 88 52 Z'),
    ell(50, 52, 38, 9, 'white'), ell(50, 52.5, 33, 6, 'cream', 0), *[circle(x, y, 2.2, c, 0) for x, y, c in [(36, 52, 'amber'), (46, 50, 'brown'), (58, 53, 'ochre'), (64, 50, 'brown'), (42, 55, 'paperShade')]],
    tube('M30 54 L14 26', 'woodLight', 3), ell(12, 22, 6, 4, 'woodLight', 2, -60), poly(star_pts(80, 22, 7, 3), 'yellow', 1.8)))

item('lightbulb', 'feelings', 'лампочка-идея', 'идея', 'idea', ['идея', 'идеи', 'идею', 'придумал', 'придумала', 'догадал', 'понял', 'поняла', 'ой тапты', 'idea'], ['feeling', 'study', 'work', 'joy', 'light'], 'hand', svg(
    *[tube(f'M{50 + 34 * math.sin(a):.1f} {40 - 34 * math.cos(a):.1f} L{50 + 42 * math.sin(a):.1f} {40 - 42 * math.cos(a):.1f}', 'yellow', 2) for a in [-1.2, -0.6, 0, 0.6, 1.2]],
    shape('M50 12 Q74 12 74 38 Q74 52 62 60 L62 70 L38 70 L38 60 Q26 52 26 38 Q26 12 50 12 Z', 'yellow'), fill('M60 14 Q74 20 74 38 Q74 52 62 60 L58 60 Q70 40 60 14 Z', 'amber'),
    ell(40, 30, 4, 8, 'white', 0, 25), line('M44 62 L44 48 Q50 40 56 48 L56 62', 'amber', 2),
    rect(38, 70, 24, 8, 'greyLight', 2), rect(40, 78, 20, 7, 'grey', 2), rect(44, 85, 12, 5, 'slateDark', 2, 2)), fx=['glow'])

item('hourglass', 'feelings', 'песочные часы', 'құм сағат', 'hourglass', ['песочн', 'ожидан', 'ждал', 'ждала', 'жду$', 'ждать', 'время', 'времени', 'уақыт', 'күттім', 'hourglass', 'waiting'], ['feeling', 'calm', 'tension', 'time', 'symbol'], 'hand', svg(
    rect(20, 6, 60, 10, 'wood', 3), rect(20, 86, 60, 10, 'wood', 3), tube('M26 16 L26 86 M74 16 L74 86', 'brown', 2),
    shape('M30 16 L70 16 Q70 36 54 50 Q70 64 70 86 L30 86 Q30 64 46 50 Q30 36 30 16 Z', 'frost'),
    shape('M36 26 L64 26 Q60 38 50 46 Q40 38 36 26 Z', 'amber', 0), shape('M50 56 L66 84 L34 84 Z', 'amber', 0), line('M50 46 L50 70', 'amber', 1.6),
    out('M30 16 L70 16 Q70 36 54 50 Q70 64 70 86 L30 86 Q30 64 46 50 Q30 36 30 16 Z'), line('M36 20 L38 34', 'white', 2.5)))

item('feather', 'feelings', 'пёрышко', 'қауырсын', 'feather', ['перо', 'перышк', 'пёрышк', 'лёгкост', 'легкост', 'легко', 'қауырсын', 'feather'], ['feeling', 'calm', 'dream', 'nature'], 'hand', group('rotate(30 50 50)',
    shape('M50 4 Q72 22 66 58 Q62 76 50 84 Q38 76 34 58 Q28 22 50 4 Z', 'ice'), fill('M50 4 Q72 22 66 58 Q62 76 50 84 Q60 50 50 4 Z', 'greyBlue'),
    *[line(f'M50 {y} L{x} {y - 8}', 'frost', 1.6) for x, y in [(36, 34), (36, 48), (38, 62), (64, 34), (64, 48), (62, 62)]],
    tube('M50 10 L50 98', 'slate', 1.5)).join(['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" stroke-linejoin="round" stroke-linecap="round">', '</svg>']), fx=['sway'])

Hh = 'M50 88 C30 74 12 60 12 40 C12 26 22 18 33 18 C42 18 48 24 50 30 C52 24 58 18 67 18 C78 18 88 26 88 40 C88 60 70 74 50 88 Z'
item('broken_heart', 'feelings', 'разбитое сердце', 'жаралы жүрек', 'broken heart', ['разбит', 'расстал', 'обид', 'грустн', 'грусть', 'печал', 'тоск', 'мұң', 'қайғы', 'sad', 'heartbreak'], ['feeling', 'sad', 'love', 'tension'], 'hand', svg(
    group('translate(-5 2) rotate(-8 30 50)', shape('M50 30 C48 24 42 18 33 18 C22 18 12 26 12 40 C12 60 30 74 50 88 L44 70 L54 56 L44 44 Z', 'brick'), ell(26, 36, 5, 8, 'coral', 0, 35)),
    group('translate(5 2) rotate(8 70 50)', shape('M50 30 C52 24 58 18 67 18 C78 18 88 26 88 40 C88 60 70 74 50 88 L44 70 L54 56 L44 44 Z', 'brickDark')),
    shape('M20 92 Q22 86 26 92 Q22 98 20 92 Z', 'ice', 1.6), shape('M80 90 Q82 84 86 90 Q82 96 80 90 Z', 'ice', 1.6)))

item('clover', 'feelings', 'клевер на удачу', 'беде', 'clover', ['клевер', 'удач', 'повезл', 'везени', 'сәттілік', 'жолы болды', 'luck', 'lucky'], ['feeling', 'joy', 'hope', 'nature', 'spring'], 'hand', svg(
    tube('M50 54 Q56 76 50 96', 'green', 3),
    *[group(f'rotate({a} 50 44)', f'<path d="M50 44 C40 36 36 20 44 16 C48 14 50 18 50 22 C50 18 52 14 56 16 C64 20 60 36 50 44 Z" fill="{H["greenSoft"]}"{st()}/>', line('M50 44 L50 24', 'green', 1.6)) for a in (0, 90, 180, 270)],
    circle(50, 44, 4, 'green', 2), ell(42, 22, 2, 4, 'mint', 0, -20)))

item('smile', 'feelings', 'улыбка', 'күлкі', 'smile', ['улыб', 'смеял', 'смех', 'смешн', 'весел', 'радост', 'радова', 'счастл', 'счасть', 'күлкі', 'күлдім', 'қуаныш', 'бақыт', 'happy', 'smile'], ['feeling', 'joy', 'friends', 'warm'], 'hand', svg(
    circle(50, 50, 40, 'amber'), circle(47.5, 47.5, 35, 'yellow', 0),
    f'<path d="M32 40 Q36 34 40 40 M60 40 Q64 34 68 40" fill="none"{st(3)}/>', shape('M30 56 Q50 80 70 56 Z', 'brickDark'), shape('M38 66 Q50 74 62 66 Q56 62 50 62 Q44 62 38 66 Z', 'coral', 0),
    ell(26, 56, 6, 3.5, 'coral', 0), ell(74, 56, 6, 3.5, 'coral', 0), ell(32, 26, 6, 4, 'white', 0, -30)), fx=['bob'])

item('tear', 'feelings', 'слеза', 'көз жас', 'tear', ['слез', 'слёз', 'плакал', 'плакала', 'плач', 'всплакн', 'жыладым', 'көз жас', 'cry', 'tears'], ['feeling', 'sad', 'calm', 'water'], 'hand', svg(
    shape('M50 8 C58 30 76 48 76 66 C76 82 64 92 50 92 C36 92 24 82 24 66 C24 48 42 30 50 8 Z', 'ice'), fill('M60 32 C70 46 76 56 76 66 C76 82 64 92 50 92 C66 84 70 66 60 32 Z', 'greyBlue'),
    ell(38, 60, 4, 9, 'white', 0, 20), f'<path d="M40 70 Q44 66 48 70 M54 70 Q58 66 62 70" fill="none"{st(2)}/>', f'<path d="M45 80 Q50 76 55 80" fill="none"{st(2)}/>'))

item('anchor', 'feelings', 'якорь', 'зәкір', 'anchor', ['якор', 'спокойн', 'покой', 'стабильн', 'тыныш', 'anchor', 'calm'], ['feeling', 'calm', 'water', 'symbol'], 'both', svg(
    circle(50, 14, 8, 'slate'), circle(50, 14, 3.5, 'paper', 0), rect(46, 22, 8, 62, 'slate', 2), rect(32, 32, 36, 7, 'slate', 3),
    tube('M16 58 Q18 88 50 90 Q82 88 84 58', 'slate', 6), poly([(10, 62), (16, 50), (24, 62)], 'slate', 2), poly([(76, 62), (84, 50), (90, 62)], 'slate', 2),
    rect(48, 24, 2.5, 56, 'greyBlue', 1, 0), tube('M54 30 Q74 40 60 56 Q48 66 56 78', 'woodLight', 1.5)))

item('rainbow_heart', 'feelings', 'тепло на душе', 'жылылық', 'warmth', ['тепло', 'тёпл', 'тепл', 'уют', 'уютн', 'обнял', 'обним', 'объят', 'жылы', 'құшақ', 'cozy', 'hug'], ['feeling', 'warm', 'love', 'family', 'home'], 'hand', svg(
    shape(Hh, 'coral'), shape('M50 76 C36 66 24 56 24 42 C24 34 30 30 36 30 C42 30 48 34 50 40 C52 34 58 30 64 30 C70 30 76 34 76 42 C76 56 64 66 50 76 Z', 'peach', 0),
    shape('M50 64 C42 58 36 52 36 44 C36 40 40 38 43 38 C46 38 49 40 50 43 C51 40 54 38 57 38 C60 38 64 40 64 44 C64 52 58 58 50 64 Z', 'yellow', 0),
    out(Hh), ell(26, 36, 5, 8, 'white', 0, 35), poly(star_pts(80, 14, 6, 2.4), 'yellow', 1.6)), fx=['hearts'])

item('storm_cloud', 'feelings', 'тревога', 'мазасыздық', 'anxiety', ['тревог', 'тревожн', 'волнова', 'волнен', 'нервнич', 'стресс', 'паник', 'боюсь', 'страшн', 'страх', 'уайым', 'қорқ', 'stress', 'anxiety'], ['feeling', 'tension', 'storm', 'sad'], 'both', svg(
    poly([(54, 60), (42, 80), (52, 80), (44, 98), (66, 72), (56, 72), (62, 60)], 'yellow'),
    ''.join(circle(x, y, r + 2.4, 'ink', 0) for x, y, r in [(28, 44, 16), (50, 32, 20), (72, 42, 16), (40, 56, 12), (62, 56, 12)]),
    ''.join(circle(x, y, r, 'slateDark', 0) for x, y, r in [(28, 44, 16), (50, 32, 20), (72, 42, 16), (40, 56, 12), (62, 56, 12)]),
    circle(44, 24, 7, 'slate', 0), f'<path d="M38 44 L44 40 M62 44 L56 40" fill="none" stroke="{H["frost"]}" stroke-width="2.4"/>', f'<path d="M42 54 Q50 48 58 54" fill="none" stroke="{H["frost"]}" stroke-width="2.4"/>'))

item('zzz', 'feelings', 'усталость', 'шаршау', 'tiredness', ['устал', 'усталост', 'вымотал', 'сонн', 'засып', 'зевал', 'шаршадым', 'шаршау', 'tired', 'sleepy'], ['feeling', 'calm', 'night', 'rest'], 'hand', svg(
    circle(36, 62, 28, 'amber'), circle(34, 60, 24, 'yellow', 0),
    f'<path d="M22 60 Q27 64 32 60 M40 60 Q45 64 50 60" fill="none"{st(2.4)}/>', ell(36, 74, 5, 4, 'brown', 2), ell(18, 68, 4, 2.2, 'coral', 0), ell(54, 68, 4, 2.2, 'coral', 0),
    *[f'<path d="M{x} {y} L{x + s} {y} L{x} {y + s} L{x + s} {y + s}" fill="none" stroke="{H["slate"]}" stroke-width="{2 + s / 8}"/>' for x, y, s in [(62, 28, 12), (76, 12, 9), (86, 2, 6)]]))

item('sparkle_star', 'feelings', 'мечта', 'арман', 'dream', ['мечт', 'мечта', 'загадал', 'желани', 'арман', 'тілек', 'dream', 'wish'], ['feeling', 'dream', 'hope', 'night', 'joy'], 'hand', svg(
    poly(star_pts(50, 50, 40, 12, 4), 'yellow'), poly([(50, 50)] + star_pts(50, 50, 40, 12, 4)[1:4] + [(50, 50)], 'amber', 0), poly(star_pts(50, 50, 40, 12, 4), 'yellow').replace(f'fill="{H["yellow"]}"', 'fill="none"'),
    poly(star_pts(80, 18, 10, 3, 4), 'white', 1.8), poly(star_pts(18, 78, 8, 2.5, 4), 'cream', 1.6), circle(84, 76, 3, 'yellow', 1.4), circle(16, 20, 2.5, 'white', 1.4)), fx=['sparkle', 'glow'])

item('cake_birthday', 'holiday', 'праздничный торт', 'туған күн торты', 'birthday cake', ['день рожден', 'днём рожден', 'днем рожден', 'днюх', 'туған күн', 'birthday'], ['holiday', 'birthday', 'joy', 'family', 'friends', 'sweet'], 'both', svg(
    ell(50, 90, 44, 6, 'white'), rect(14, 54, 72, 34, 'peach', 4), rect(66, 56, 18, 30, 'coral', 0, 0), out('M18 54 L82 54 Q86 54 86 58 L86 84 Q86 88 82 88 L18 88 Q14 88 14 84 L14 58 Q14 54 18 54 Z'),
    shape('M14 58 Q14 50 22 50 L78 50 Q86 50 86 58 Q80 66 74 58 Q68 66 62 58 Q56 66 50 58 Q44 66 38 58 Q32 66 26 58 Q20 66 14 58 Z', 'white'),
    rect(14, 74, 72, 5, 'brick', 0, 2), *[circle(x, 82, 2, 'yellow', 0) for x in (24, 40, 56, 72)],
    *[rect(x, 30, 5, 20, c, 1.5, 2) for x, c in [(30, 'teal'), (47.5, 'yellow'), (65, 'teal')]],
    *[shape(f'M{x + 2.5} 18 Q{x + 7} 24 {x + 2.5} 29 Q{x - 2} 24 {x + 2.5} 18 Z', 'amber', 1.8) for x in (30, 47.5, 65)]), fx=['flame', 'sparkle'])

item('confetti', 'holiday', 'хлопушка', 'конфетти', 'party popper', ['хлопушк', 'конфетти', 'поздравил', 'поздравл', 'праздновал', 'құттықта', 'confetti', 'congrats'], ['holiday', 'joy', 'birthday', 'friends', 'energy'], 'hand', svg(
    shape('M14 92 L34 40 L62 68 Z', 'amber'), line('M22 74 L44 56 M28 58 L40 50 M18 86 L52 62', 'brick', 3), out('M14 92 L34 40 L62 68 Z'),
    *[rect(x, y, 6, 3, c, 1, 1.4, f'rotate({r} {x} {y})') for x, y, c, r in [(50, 22, 'teal', 30), (64, 14, 'brick', -20), (74, 34, 'yellow', 50), (84, 22, 'mauve', 10), (62, 40, 'coral', -40), (80, 50, 'teal', 20), (44, 10, 'yellow', 60)]],
    *[circle(x, y, 2.5, c, 1.4) for x, y, c in [(56, 30, 'yellow'), (72, 24, 'teal'), (88, 40, 'coral'), (70, 58, 'yellow')]],
    tube('M48 34 Q56 26 52 18', 'coral', 1.5), tube('M60 50 Q70 44 72 52', 'teal', 1.5)), fx=['sparkle'])

item('heart_letter', 'feelings', 'любовь', 'махаббат', 'love', ['влюбил', 'влюблен', 'свидани', 'романтик', 'ғашық', 'кездесу', 'love', 'date'], ['feeling', 'love', 'joy', 'warm'], 'hand', svg(
    *[f'<path d="M{x} {y} C{x} {y - s} {x + s} {y - s} {x + s} {y - s * 0.3} C{x + s} {y - s} {x + 2 * s} {y - s} {x + 2 * s} {y} C{x + 2 * s} {y + s * 0.8} {x + s} {y + s * 1.6} {x + s} {y + s * 1.6} C{x + s} {y + s * 1.6} {x} {y + s * 0.8} {x} {y} Z" fill="{H[c]}"{st(2.2)}/>'
      for x, y, s, c in [(14, 40, 18, 'brick'), (60, 24, 10, 'coral'), (64, 70, 8, 'peach'), (24, 14, 6, 'peach')]],
    ell(24, 36, 3, 5, 'coral', 0, 30)), fx=['hearts'])

write_meta('pic8')
