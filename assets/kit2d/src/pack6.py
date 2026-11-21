# Пачка 6 картинок: транспорт, музыка, игры.
from lib import *

def wheel(cx, cy, r=8, c='navy'):
    return circle(cx, cy, r, c) + circle(cx, cy, r * 0.45, 'greyLight', 1.8)

item('train', 'transport', 'поезд', 'пойыз', 'train', ['поезд', 'вокзал', 'электричк', 'вагон', 'пойыз', 'пойызд', 'train'], ['transport', 'travel', 'city'], 'ground', svg(
    rect(6, 90, 88, 4, 'brown', 1, 2), rect(10, 34, 52, 46, 'brick', 4), rect(54, 20, 30, 60, 'brick', 4), fill('M76 22 Q84 22 84 30 L84 78 L76 78 Z', 'brickDark'),
    rect(58, 26, 22, 16, 'ice', 2, 2), rect(16, 42, 14, 12, 'ice', 2, 2), rect(36, 42, 14, 12, 'ice', 2, 2), rect(10, 62, 74, 6, 'yellow', 0, 2),
    rect(14, 20, 12, 16, 'slateDark', 2), shape('M10 20 L30 20 L26 12 L14 12 Z', 'slateDark'), circle(20, 6, 4, 'frost', 1.5), circle(28, 2, 3, 'frost', 1.5),
    wheel(22, 82), wheel(42, 82), wheel(64, 82, 10), rect(84, 70, 10, 10, 'greyLight', 2, 2)))

item('plane', 'transport', 'самолёт', 'ұшақ', 'plane', ['самолет', 'самолёт', 'аэропорт', 'перелет', 'перелёт', 'полет', 'полёт', 'улетел', 'прилетел', 'ұшақ', 'plane', 'flight'], ['transport', 'travel', 'sky', 'dream'], 'both', svg(
    shape('M8 56 Q8 46 22 46 L76 46 Q94 46 94 54 Q94 62 76 62 L22 62 Q8 62 8 56 Z', 'white'), fill('M10 58 L92 58 Q88 62 76 62 L22 62 Q12 62 10 58 Z', 'greyLight'),
    shape('M44 54 L30 86 L42 86 L62 54 Z', 'slate'), shape('M46 48 L36 22 L46 22 L62 48 Z', 'slate'), shape('M14 48 L8 30 L16 30 L26 46 Z', 'brick'),
    *[circle(x, 52, 2.6, 'ice', 1.5) for x in (30, 40, 50, 60, 70)], shape('M80 48 Q90 48 92 54 L84 54 Z', 'ice', 2), rect(20, 56, 64, 2.5, 'brick', 0, 0)))

item('boat', 'transport', 'лодка', 'қайық', 'boat', ['лодк', 'корабл', 'парусн', 'яхт', 'катер', 'қайық', 'кеме', 'boat', 'ship'], ['transport', 'travel', 'summer', 'water', 'calm'], 'both', svg(
    shape('M10 66 L90 66 L78 86 L22 86 Z', 'brick'), fill('M70 66 L90 66 L78 86 L66 86 Z', 'brickDark'), rect(10, 66, 80, 5, 'white', 0, 2),
    rect(48, 14, 4, 52, 'wood', 1, 2), shape('M53 16 Q84 40 80 62 L53 62 Z', 'white'), shape('M47 22 Q24 44 26 62 L47 62 Z', 'cream'),
    rect(52, 8, 14, 8, 'coral', 1, 2), line('M4 92 Q16 86 28 92 Q40 98 52 92 Q64 86 76 92 Q88 98 96 92', 'teal', 3)))

item('tram', 'transport', 'трамвай', 'трамвай', 'tram', ['трамва', 'троллейбус', 'tram$', 'trolley'], ['transport', 'city', 'street'], 'ground', svg(
    line('M30 4 L50 22 L70 4', 'ink', 2), rect(10, 22, 80, 62, 'teal', 8), rect(10, 62, 80, 22, 'tealDark', 0, 0), out('M18 22 L82 22 Q90 22 90 30 L90 84 L10 84 L10 30 Q10 22 18 22 Z'),
    *[rect(x, 32, 14, 18, 'ice', 2, 2) for x in (16, 34, 52, 70)], rect(10, 56, 80, 5, 'cream', 0, 2),
    wheel(26, 86), wheel(74, 86), rect(42, 14, 16, 8, 'slateDark', 1, 2)))

item('rocket', 'transport', 'ракета', 'зымыран', 'rocket', ['ракет', 'космос', 'космонавт', 'ғарыш', 'зымыран', 'rocket', 'space'], ['transport', 'dream', 'sky', 'energy', 'joy'], 'both', svg(
    shape('M38 70 L28 88 L40 80 Z', 'brick'), shape('M62 70 L72 88 L60 80 Z', 'brick'),
    shape('M50 4 Q70 22 66 70 L34 70 Q30 22 50 4 Z', 'white'), fill('M56 12 Q70 26 66 70 L56 70 Q62 40 56 12 Z', 'greyLight'),
    shape('M44 14 Q50 4 56 14 Z', 'brick', 2), circle(50, 36, 8, 'ice', 3), circle(47, 33, 2.5, 'white', 0),
    shape('M40 70 L60 70 L56 78 L44 78 Z', 'slate'), shape('M44 80 Q50 100 56 80 Z', 'amber', 2), shape('M47 80 Q50 92 53 80 Z', 'yellow', 0)), fx=['flame'])

item('suitcase', 'transport', 'чемодан', 'чемодан', 'suitcase', ['чемодан', 'багаж', 'путешеств', 'поездк', 'отпуск', 'саяхат', 'suitcase', 'travel'], ['travel', 'transport', 'summer'], 'both', svg(
    tube('M38 22 L38 12 L62 12 L62 22', 'slateDark', 3), rect(16, 20, 68, 66, 'coral', 6), rect(66, 22, 16, 62, 'brick', 0, 0), out('M22 20 L78 20 Q84 20 84 26 L84 80 Q84 86 78 86 L22 86 Q16 86 16 80 L16 26 Q16 20 22 20 Z'),
    rect(30, 20, 6, 66, 'cream', 0, 2), rect(64, 20, 6, 66, 'cream', 0, 2), circle(26, 90, 4, 'ink', 0), circle(74, 90, 4, 'ink', 0),
    rect(40, 40, 18, 12, 'yellow', 2, 2, 'rotate(-10 49 46)'), poly(star_pts(52, 66, 6, 2.5), 'white', 1.8)))

item('map', 'transport', 'карта', 'карта', 'map', ['карта', 'карту', 'карте', 'маршрут', 'навигатор', 'map'], ['travel', 'study', 'transport'], 'both', svg(
    poly([(8, 22), (36, 14), (64, 22), (92, 14), (92, 82), (64, 90), (36, 82), (8, 90)], 'paper'), poly([(36, 14), (64, 22), (64, 90), (36, 82)], 'cream', 0), out('M8 22 L36 14 L64 22 L92 14 L92 82 L64 90 L36 82 L8 90 Z'),
    line('M36 14 L36 82 M64 22 L64 90', 'paperShade', 2), shape('M14 40 Q24 30 30 44 Q26 56 16 52 Z', 'greenSoft', 2), shape('M70 56 Q84 50 86 66 Q78 76 70 70 Z', 'ice', 2),
    f'<path d="M20 74 Q36 62 48 66 Q62 70 70 40" fill="none" stroke="{H["brick"]}" stroke-width="2.5" />', shape('M70 30 Q78 30 78 38 Q78 44 70 52 Q62 44 62 38 Q62 30 70 30 Z', 'brick', 2), circle(70, 38, 3, 'white', 0)))

item('piano', 'music', 'пианино', 'фортепиано', 'piano', ['пианин', 'фортеп', 'рояль', 'синтезатор', 'piano'], ['music', 'calm', 'home', 'study'], 'both', svg(
    rect(8, 20, 84, 44, 'brownDark', 4), rect(14, 26, 72, 14, 'brown', 2, 2), rect(30, 28, 40, 9, 'white', 1, 1.5),
    rect(8, 52, 84, 22, 'white', 2), *[line(f'M{x} 52 L{x} 74', 'paperShade', 1.6) for x in range(18, 92, 10)],
    *[rect(x, 52, 6, 13, 'ink', 1, 0) for x in (15, 25, 45, 55, 65, 85)], rect(14, 74, 6, 18, 'brownDark', 1, 2), rect(80, 74, 6, 18, 'brownDark', 1, 2)), fx=['notes'])

item('drum', 'music', 'барабан', 'дабыл', 'drum', ['барабан', 'дабыл', 'drum'], ['music', 'energy', 'joy', 'holiday'], 'both', svg(
    tube('M30 10 L48 32', 'woodLight', 3), tube('M70 10 L52 32', 'woodLight', 3),
    rect(14, 40, 72, 46, 'brick', 4), fill('M66 42 L86 42 L86 82 L66 82 Q72 62 66 42 Z', 'brickDark'),
    line('M14 46 L30 80 L46 46 L62 80 L78 46 L86 62', 'yellow', 2.5), rect(12, 78, 76, 8, 'white', 3), ell(50, 40, 36, 9, 'white'), ell(44, 38, 14, 3, 'frost', 0)), fx=['notes'])

item('microphone', 'music', 'микрофон', 'микрофон', 'microphone', ['микрофон', 'караоке', 'спел', 'пою', 'петь', 'вокал', 'microphone', 'karaoke'], ['music', 'joy', 'friends', 'evening'], 'hand', svg(
    group('rotate(-20 50 50)', rect(42, 46, 16, 46, 'slateDark', 4), rect(42, 50, 16, 6, 'slate', 0, 2),
          circle(50, 30, 20, 'greyLight'), *[line(f'M{x} 14 L{x} 46', 'grey', 1.6) for x in (40, 46, 54, 60)], line('M32 30 L68 30 M34 22 L66 22 M34 38 L66 38', 'grey', 1.6),
          circle(50, 30, 20, 'greyLight').replace(f'fill="{H["greyLight"]}"', 'fill="none"'), ell(42, 22, 4, 6, 'white', 0, 30), rect(46, 64, 8, 6, 'brick', 1, 1.5))), fx=['notes'])

item('violin', 'music', 'скрипка', 'скрипка', 'violin', ['скрипк', 'violin'], ['music', 'calm', 'love', 'evening'], 'both', svg(
    group('rotate(-25 50 55)',
          rect(46, 6, 8, 38, 'brownDark', 1.5), shape('M44 4 Q44 -2 50 -2 Q56 -2 56 4 Z', 'brown', 2),
          shape('M50 38 Q64 36 64 48 Q64 54 58 56 Q68 60 68 72 Q68 92 50 92 Q32 92 32 72 Q32 60 42 56 Q36 54 36 48 Q36 36 50 38 Z', 'amber'),
          fill('M58 40 Q64 42 64 48 Q64 54 58 56 Q68 60 68 72 Q68 88 56 92 Q66 72 58 40 Z', 'ochre'),
          line('M44 58 Q42 62 44 66 M56 58 Q58 62 56 66', 'ink', 1.8), rect(44, 76, 12, 3, 'ink', 1, 0), line('M48.5 4 L48.5 80 M51.5 4 L51.5 80', 'cream', 1)),
    tube('M14 92 L88 22', 'woodLight', 2), line('M16 88 L86 24', 'cream', 1)), fx=['notes'])

item('radio', 'music', 'радио', 'радио', 'radio', ['радио', 'приёмник', 'приемник', 'магнитофон', 'кассет', 'radio'], ['music', 'home', 'memory', 'calm'], 'both', svg(
    tube('M64 26 L82 6', 'slateDark', 2), circle(82, 6, 2.5, 'slate', 1.5), rect(8, 26, 84, 58, 'coral', 8), rect(70, 28, 20, 54, 'brick', 0, 0),
    out('M16 26 L84 26 Q92 26 92 34 L92 76 Q92 84 84 84 L16 84 Q8 84 8 76 L8 34 Q8 26 16 26 Z'),
    circle(32, 56, 17, 'cream'), *[circle(round(32 + r * math.sin(a), 1), round(56 - r * math.cos(a), 1), 1.6, 'paperShade', 0) for r in (6, 11) for a in [i * math.pi / 4 for i in range(8)]],
    rect(56, 36, 28, 14, 'yellow', 2, 2), line('M70 38 L70 48', 'brick', 2), circle(62, 66, 6, 'cream', 2), circle(78, 66, 6, 'cream', 2), rect(16, 86, 10, 6, 'ink', 1, 0), rect(74, 86, 10, 6, 'ink', 1, 0)), fx=['notes'])

item('vinyl', 'music', 'пластинка', 'пластинка', 'vinyl record', ['пластинк', 'винил', 'vinyl', 'record'], ['music', 'memory', 'calm', 'home'], 'both', svg(
    circle(50, 52, 42, 'ink', 0), *[circle(50, 52, r, 'slateDark', 0).replace(f'fill="{H["slateDark"]}"', f'fill="none" stroke="{H["slateDark"]}" stroke-width="1.5"') for r in (36, 30, 24)],
    circle(50, 52, 14, 'coral', 2), circle(50, 52, 3, 'ink', 0), line('M24 30 Q34 20 46 16', 'slate', 3),
    poly(star_pts(50, 52, 6, 2.5), 'yellow', 0)), fx=['spin'])

item('speaker', 'music', 'колонка', 'колонка', 'speaker', ['колонк', 'динамик', 'speaker'], ['music', 'friends', 'energy', 'tech'], 'both', svg(
    rect(20, 8, 60, 86, 'slateDark', 8), rect(66, 10, 12, 82, 'navy', 0, 0), out('M28 8 L72 8 Q80 8 80 16 L80 86 Q80 94 72 94 L28 94 Q20 94 20 86 L20 16 Q20 8 28 8 Z'),
    circle(50, 30, 12, 'slate'), circle(50, 30, 5, 'ink', 0), circle(50, 66, 20, 'slate'), circle(50, 66, 12, 'navy', 0), circle(50, 66, 5, 'ink', 0),
    circle(44, 60, 3, 'greyBlue', 0), circle(30, 14, 2, 'mint', 0)), fx=['notes'])

item('kite', 'play', 'воздушный змей', 'батпырауық', 'kite', ['воздушн змей', 'змей', 'змея', 'змеем', 'батпырауық', 'kite'], ['play', 'sky', 'summer', 'joy', 'childhood'], 'both', svg(
    poly([(50, 4), (80, 34), (50, 64), (20, 34)], 'coral'), poly([(50, 4), (80, 34), (50, 34)], 'yellow', 0), poly([(50, 34), (50, 64), (20, 34)], 'teal', 0), out('M50 4 L80 34 L50 64 L20 34 Z'),
    line('M50 4 L50 64 M20 34 L80 34', 'ink', 1.6), line('M50 64 Q40 76 50 84 Q60 92 52 98', 'ink', 1.6),
    *[poly([(x - 5, y - 4), (x + 5, y + 4), (x + 5, y - 4), (x - 5, y + 4)], c, 1.6) for x, y, c in [(44, 74, 'brick'), (52, 86, 'yellow'), (50, 96, 'teal')]]))

item('balloon', 'play', 'воздушный шар', 'әуе шары', 'balloon', ['шарик', 'шары', 'шаров', 'воздушн шар', 'шар$', 'шарм$', 'balloon'], ['play', 'holiday', 'birthday', 'joy', 'sky'], 'hand', svg(
    line('M40 66 Q44 80 38 96 M62 62 Q58 80 64 96', 'ink', 1.4),
    ell(38, 38, 20, 24, 'brick'), ell(31, 28, 4, 8, 'coral', 0, 20), poly([(35, 62), (41, 62), (38, 67)], 'brick', 2),
    ell(64, 32, 18, 22, 'teal'), ell(58, 22, 4, 7, 'mint', 0, 20), poly([(61, 54), (67, 54), (64, 59)], 'teal', 2),
    ell(52, 52, 14, 17, 'yellow'), ell(48, 46, 3, 5, 'white', 0, 20), poly([(50, 69), (54, 69), (52, 73)], 'yellow', 2)), fx=['bob'])

item('puzzle', 'play', 'пазл', 'пазл', 'puzzle', ['пазл', 'головоломк', 'puzzle'], ['play', 'calm', 'home', 'study'], 'hand', svg(
    shape('M12 20 L40 20 Q38 10 46 10 Q54 10 52 20 L80 20 L80 46 Q90 44 90 52 Q90 60 80 58 L80 86 L52 86 Q54 76 46 76 Q38 76 40 86 L12 86 L12 58 Q22 60 22 52 Q22 44 12 46 Z', 'mauve'),
    fill('M64 20 L80 20 L80 46 Q90 44 90 52 Q90 60 80 58 L80 86 L64 86 Z', 'plum'), out('M12 20 L40 20 Q38 10 46 10 Q54 10 52 20 L80 20 L80 46 Q90 44 90 52 Q90 60 80 58 L80 86 L52 86 Q54 76 46 76 Q38 76 40 86 L12 86 L12 58 Q22 60 22 52 Q22 44 12 46 Z'),
    poly(star_pts(46, 52, 12, 5), 'yellow', 2), circle(26, 32, 3, 'peach', 0)))

def pips(cx, cy, n, s=7):
    pos = {1: [(0, 0)], 2: [(-1, -1), (1, 1)], 3: [(-1, -1), (0, 0), (1, 1)], 4: [(-1, -1), (1, -1), (-1, 1), (1, 1)], 5: [(-1, -1), (1, -1), (0, 0), (-1, 1), (1, 1)], 6: [(-1, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (1, 1)]}[n]
    return ''.join(circle(cx + dx * s, cy + dy * s, 2.6, 'ink', 0) for dx, dy in pos)
item('dice', 'play', 'кубик', 'ойын сүйегі', 'dice', ['кубик', 'игральн', 'настолк', 'настольн игр', 'dice', 'board game'], ['play', 'friends', 'joy', 'home'], 'hand', svg(
    rect(12, 40, 40, 40, 'white', 6, 2.5, 'rotate(-12 32 60)'), group('rotate(-12 32 60)', pips(32, 60, 5)),
    rect(50, 26, 38, 38, 'brick', 6, 2.5, 'rotate(14 69 45)'), group('rotate(14 69 45)', ''.join(circle(69 + dx * 8, 45 + dy * 8, 2.6, 'white', 0) for dx, dy in [(-1, -1), (0, 0), (1, 1)]))))

item('chess', 'play', 'шахматы', 'шахмат', 'chess', ['шахмат', 'шашк', 'шахмат', 'chess'], ['play', 'calm', 'study', 'friends'], 'both', svg(
    shape('M28 92 L72 92 L68 82 L32 82 Z', 'white'), shape('M36 82 Q38 66 42 60 L58 60 Q62 66 64 82 Z', 'white'), rect(36, 54, 28, 7, 'white', 2),
    shape('M40 54 Q30 40 38 24 Q46 14 60 18 Q70 22 66 34 L58 32 Q54 40 62 54 Z', 'white'), fill('M58 34 Q54 40 62 54 L54 54 Q50 42 56 32 Z', 'paperShade'),
    circle(50, 26, 2.5, 'ink', 0), line('M38 24 Q34 30 36 36', 'paperShade', 2),
    rect(8, 74, 18, 18, 'ink', 1, 0), rect(74, 74, 18, 18, 'ink', 1, 0), rect(8, 74, 84, 18, 'ink', 0, 0).replace('<rect', '<rect opacity="0"')))

item('teddy', 'play', 'плюшевый мишка', 'ойыншық аю', 'teddy bear', ['мишк', 'плюшев', 'игрушк', 'ойыншық', 'teddy', 'toy'], ['play', 'childhood', 'love', 'home', 'warm'], 'both', svg(
    circle(26, 22, 10, 'woodLight'), circle(74, 22, 10, 'woodLight'), circle(26, 22, 5, 'peach', 0), circle(74, 22, 5, 'peach', 0),
    ell(50, 74, 26, 22, 'woodLight'), ell(50, 76, 14, 13, 'cream', 0), ell(26, 70, 9, 12, 'woodLight', 2.5, 30), ell(74, 70, 9, 12, 'woodLight', 2.5, -30),
    ell(34, 92, 11, 7, 'woodLight'), ell(66, 92, 11, 7, 'woodLight'), ell(34, 92, 6, 4, 'peach', 0), ell(66, 92, 6, 4, 'peach', 0),
    circle(50, 38, 22, 'woodLight'), ell(50, 46, 10, 8, 'cream', 2), ell(50, 43, 4, 3, 'ink', 0), f'<path d="M50 46 Q47 51 44 49 M50 46 Q53 51 56 49" fill="none"{st(1.8)}/>',
    ell(41, 34, 2.4, 3, 'ink', 0), ell(59, 34, 2.4, 3, 'ink', 0), ell(34, 44, 3.5, 2, 'coral', 0), ell(66, 44, 3.5, 2, 'coral', 0),
    shape('M40 58 L50 64 L60 58 L58 68 L50 64 L42 68 Z', 'brick', 2)))

item('trophy', 'play', 'кубок', 'кубок', 'trophy', ['кубок', 'победил', 'победа', 'выиграл', 'чемпион', 'медал', 'жеңіс', 'жеңдік', 'trophy', 'win'], ['play', 'sport', 'joy', 'holiday', 'energy'], 'both', svg(
    tube('M28 22 Q8 22 12 40 Q16 50 30 50', 'amber', 4), tube('M72 22 Q92 22 88 40 Q84 50 70 50', 'amber', 4),
    shape('M26 14 L74 14 Q74 56 50 62 Q26 56 26 14 Z', 'amber'), fill('M62 14 L74 14 Q74 56 50 62 Q66 46 62 14 Z', 'ochre'), ell(36, 28, 4, 9, 'yellow', 0),
    rect(44, 60, 12, 14, 'ochre', 1, 2), rect(30, 74, 40, 8, 'brown', 2), rect(24, 82, 52, 10, 'brownDark', 2), rect(40, 84, 20, 5, 'yellow', 1, 1.5),
    poly(star_pts(50, 34, 9, 4), 'yellow', 2)), fx=['sparkle'])

item('skates', 'play', 'коньки', 'коньки', 'ice skates', ['коньк', 'каток', 'катке', 'каталис', 'мұз айдын', 'skate'], ['play', 'sport', 'winter', 'cold', 'joy'], 'both', svg(
    shape('M18 20 L40 20 L40 56 Q60 54 72 62 Q80 68 76 74 L18 74 Z', 'white'), fill('M18 62 L76 62 Q80 68 76 74 L18 74 Z', 'greyLight'),
    rect(16, 14, 26, 8, 'brick', 3), *[line(f'M28 {y} L38 {y + 4}', 'brick', 2) for y in (28, 38, 48)],
    rect(20, 76, 52, 4, 'slate', 1, 2), line('M14 88 L74 88 Q84 88 84 80', 'greyLight', 3).replace('stroke-width="3"', 'stroke-width="4"'), out('M14 88 L74 88 Q84 88 84 80'),
    rect(28, 78, 4, 10, 'slate', 0, 2), rect(60, 78, 4, 10, 'slate', 0, 2)))

item('sled', 'play', 'санки', 'шана', 'sled', ['санк', 'санях', 'горк', 'шана', 'sled'], ['play', 'winter', 'cold', 'childhood', 'joy'], 'both', svg(
    tube('M8 80 L80 80 Q94 80 92 66', 'slateDark', 3), *[rect(x, 64, 4, 16, 'slateDark', 1, 2) for x in (22, 46, 70)],
    rect(14, 52, 68, 14, 'brick', 3), *[line(f'M{x} 52 L{x} 66', 'brickDark', 2) for x in (30, 48, 66)],
    tube('M82 56 Q96 40 86 30', 'brown', 2), shape('M20 52 Q24 36 38 40 Q46 44 44 52 Z', 'white', 2),
    poly([(30, 30), (34, 36), (28, 36)], 'white', 1.4), poly([(60, 34), (64, 40), (58, 40)], 'white', 1.4)))

item('bicycle_helmet', 'play', 'шлем', 'дулыға', 'helmet', ['шлем', 'дулыға', 'helmet'], ['play', 'sport', 'transport'], 'hand', svg(
    shape('M12 66 Q12 22 50 20 Q88 22 88 66 Z', 'teal'), fill('M66 24 Q88 32 88 66 L72 66 Q76 40 66 24 Z', 'tealDark'),
    *[out(f'M{x} 26 Q{x + 4} 44 {x + 2} 60', 2) for x in (36, 50, 64)],
    rect(8, 62, 84, 8, 'slateDark', 4), ell(28, 36, 5, 8, 'mint', 0, 30), tube('M22 70 Q30 90 50 90', 'ink', 1.2), rect(46, 86, 8, 6, 'slate', 2, 2)))

write_meta('pic6')
