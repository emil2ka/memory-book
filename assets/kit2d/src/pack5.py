# Пачка 5 картинок: город, дом, учёба и работа.
from lib import *

item('traffic_light', 'city', 'светофор', 'бағдаршам', 'traffic light', ['светофор', 'бағдаршам', 'перекрест', 'traffic'], ['city', 'street', 'tension'], 'ground', svg(
    rect(46, 60, 8, 34, 'slateDark', 1), ell(50, 94, 12, 3, 'slateDark'),
    rect(32, 6, 36, 58, 'slateDark', 8), rect(36, 10, 28, 50, 'navy', 6, 0),
    circle(50, 20, 7, 'brick'), circle(50, 35, 7, 'amber'), circle(50, 50, 7, 'greenSoft'), circle(48, 48, 2, 'mint', 0),
    rect(28, 14, 6, 10, 'slate', 2, 2), rect(66, 14, 6, 10, 'slate', 2, 2)))

item('shop', 'city', 'магазин', 'дүкен', 'shop', ['магазин', 'супермаркет', 'дүкен', 'лавк$', 'покупк', 'купил', 'купила', 'shop', 'store'], ['city', 'street', 'popup', 'place'], 'ground', svg(
    rect(10, 34, 80, 60, 'cream', 1), rect(70, 34, 20, 60, 'paperShade', 0, 0), out('M10 34 L10 94 L90 94 L90 34'),
    rect(16, 52, 32, 30, 'ice', 1.5), line('M20 78 L30 58 M30 78 L40 60', 'white', 2.5),
    rect(56, 54, 24, 40, 'teal', 1.5), circle(60, 74, 1.6, 'yellow', 1.2), rect(58, 58, 20, 14, 'ice', 1, 2),
    *[shape(f'M{x} 22 L{x + 16} 22 L{x + 16} 36 Q{x + 8} 42 {x} 36 Z', 'brick' if i % 2 else 'white') for i, x in enumerate(range(6, 90, 16))],
    rect(4, 16, 92, 8, 'brickDark', 2), rect(30, 4, 40, 12, 'yellow', 2), circle(50, 10, 3, 'brick', 1.5)))

item('skyscraper', 'city', 'многоэтажка', 'көпқабатты үй', 'tower block', ['многоэтаж', 'небоскр', 'высотк', 'город', 'көпқабат', 'қала', 'city$', 'building'], ['city', 'street', 'popup', 'place', 'work'], 'ground', svg(
    rect(14, 30, 30, 64, 'greyBlue', 1), rect(46, 8, 40, 86, 'slate', 1), rect(72, 8, 14, 86, 'slateDark', 0, 0), out('M46 94 L46 8 L86 8 L86 94'),
    *[rect(x, y, 7, 6, 'yellow' if (x + y) % 3 == 0 else 'ice', 0.5, 1.5) for x in (51, 62, 74) for y in range(14, 84, 11)],
    *[rect(x, y, 6, 5, 'yellow' if (x * y) % 4 == 0 else 'frost', 0.5, 1.5) for x in (19, 31) for y in range(36, 86, 10)],
    rect(58, 84, 16, 10, 'navy', 1, 2), rect(60, 2, 4, 8, 'slateDark', 0, 2), circle(62, 2, 2, 'brick', 1.2)))

item('fountain', 'city', 'фонтан', 'субұрқақ', 'fountain', ['фонтан', 'субұрқақ', 'площад', 'fountain'], ['city', 'park', 'summer', 'water', 'popup', 'place'], 'ground', svg(
    tube('M50 40 Q38 20 26 40', 'ice', 3), tube('M50 40 Q62 20 74 40', 'ice', 3), tube('M50 30 L50 6', 'frost', 3),
    *[circle(x, y, 2.4, 'frost', 1.4) for x, y in [(26, 46), (74, 46), (44, 4), (56, 6)]],
    shape('M30 50 L70 50 L66 58 L34 58 Z', 'greyLight'), rect(46, 56, 8, 18, 'greyLight', 1, 2),
    ell(50, 80, 42, 12, 'greyLight'), ell(50, 78, 36, 8, 'teal', 0), ell(42, 77, 12, 2.5, 'ice', 0),
    rect(8, 80, 84, 12, 'grey', 0, 0), out('M8 80 L8 92 Q50 100 92 92 L92 80'), ell(50, 92, 42, 5, 'grey', 0)))

item('mailbox', 'city', 'почтовый ящик', 'пошта жәшігі', 'mailbox', ['почтов', 'почт', 'пошта', 'mailbox', 'post$'], ['city', 'street', 'friends', 'love'], 'ground', svg(
    rect(46, 50, 8, 44, 'wood', 1), ell(50, 94, 12, 3, 'brown'),
    shape('M18 54 L18 30 Q18 14 38 14 L62 14 Q82 14 82 30 L82 54 Z', 'brick'), fill('M66 16 Q82 18 82 30 L82 54 L70 54 Q74 30 66 16 Z', 'brickDark'),
    rect(30, 28, 40, 5, 'ink', 2, 0), rect(16, 52, 68, 6, 'brickDark', 2),
    tube('M82 26 L92 26 L92 14', 'yellow', 2.5), rect(88, 8, 10, 8, 'yellow', 1, 2),
    rect(34, 2, 20, 14, 'white', 1, 2, 'rotate(-12 44 9)'), line('M36 4 L44 10 L52 4', 'paperShade', 1.4)))

item('ticket', 'city', 'билет', 'билет', 'ticket', ['билет', 'кинотеатр', 'кино$', 'кино ', 'фильм', 'театр', 'концерт', 'ticket', 'cinema'], ['city', 'friends', 'joy', 'evening'], 'hand', svg(
    group('rotate(-10 50 52)',
          shape('M10 30 L90 30 L90 44 Q82 46 82 52 Q82 58 90 60 L90 74 L10 74 L10 60 Q18 58 18 52 Q18 46 10 44 Z', 'yellow'),
          rect(66, 30, 24, 44, 'amber', 0, 0), out('M10 30 L90 30 L90 44 Q82 46 82 52 Q82 58 90 60 L90 74 L10 74 L10 60 Q18 58 18 52 Q18 46 10 44 Z'),
          *[circle(64, y, 1.4, 'ink', 0) for y in range(34, 74, 6)], poly(star_pts(40, 52, 12, 5), 'brick', 2), rect(70, 46, 14, 4, 'brick', 1, 0), rect(70, 54, 10, 3, 'brick', 1, 0))))

item('sofa', 'home', 'диван', 'диван', 'sofa', ['диван', 'софа', 'дивана', 'sofa', 'couch'], ['home', 'rest', 'calm', 'warm', 'family'], 'ground', svg(
    rect(16, 84, 6, 10, 'brown', 1, 2), rect(78, 84, 6, 10, 'brown', 1, 2),
    rect(14, 28, 72, 34, 'coral', 10), rect(16, 56, 68, 28, 'coral', 6), fill('M66 30 Q84 30 84 44 L84 82 L70 82 Q74 50 66 30 Z', 'brick'),
    rect(20, 54, 30, 12, 'peach', 4, 2), rect(50, 54, 30, 12, 'peach', 4, 2),
    rect(4, 46, 16, 40, 'coral', 6), rect(80, 46, 16, 40, 'brick', 6),
    rect(26, 36, 16, 14, 'yellow', 4, 2, 'rotate(-10 34 43)'), poly([(34, 40), (37, 43), (34, 46), (31, 43)], 'amber', 0)))

item('bed', 'home', 'кровать', 'төсек', 'bed', ['кроват', 'постел', 'спал', 'спать', 'выспал', 'проснул', 'сон$', 'сна$', 'төсек', 'ұйқы', 'bed', 'sleep'], ['home', 'night', 'rest', 'calm', 'morning'], 'ground', svg(
    rect(8, 30, 10, 64, 'wood', 2), rect(82, 50, 10, 44, 'wood', 2),
    rect(14, 58, 72, 22, 'white', 4), rect(14, 72, 72, 16, 'woodLight', 2),
    shape('M36 56 L86 56 L86 76 Q60 82 36 76 Z', 'slate'), fill('M70 56 L86 56 L86 76 Q78 78 72 78 Q76 66 70 56 Z', 'slateDark'),
    line('M42 66 L80 66', 'greyBlue', 2), rect(18, 46, 22, 14, 'white', 6), rect(20, 48, 8, 3, 'frost', 1.5, 0),
    poly(star_pts(76, 30, 6, 2.4), 'yellow', 1.8), poly(star_pts(60, 18, 4, 1.6), 'cream', 1.4)))

item('desk_lamp', 'home', 'настольная лампа', 'үстел шамы', 'desk lamp', ['лампа', 'лампу', 'лампы', 'лампой', 'лампочк', 'торшер', 'светильник', 'шамы', 'lamp'], ['home', 'study', 'night', 'light', 'calm'], 'hand', svg(
    ell(36, 92, 22, 5, 'slateDark'), tube('M36 90 L30 56 L58 34', 'slate', 3), circle(30, 56, 4, 'slateDark', 2),
    shape('M50 22 L76 12 L88 40 L62 50 Z', 'amber'), fill('M76 12 L88 40 L80 43 Q78 24 76 12 Z', 'ochre'),
    ell(75, 45, 13, 5, 'yellow', 2, -21), shape('M70 50 L56 92 L96 92 L84 44 Z', 'yellow', 0).replace('<path', '<path opacity="0.45"'),
    circle(58, 34, 4, 'slateDark', 2)), fx=['glow'])

item('window', 'home', 'окно', 'терезе', 'window', ['окно', 'окна$', 'окну', 'окном', 'окне', 'окош', 'терезе', 'window'], ['home', 'calm', 'morning', 'light'], 'both', svg(
    rect(12, 8, 76, 80, 'white', 3), rect(18, 14, 64, 68, 'ice', 1, 2), line('M50 14 L50 82 M18 48 L82 48', 'white', 4),
    out('M50 14 L50 82 M18 48 L82 48', 1.2), line('M24 40 L36 22 M56 74 L68 56', 'frost', 3),
    shape('M10 8 Q20 40 10 90 L4 90 L4 8 Z', 'coral'), shape('M90 8 Q80 40 90 90 L96 90 L96 8 Z', 'coral'),
    rect(6, 86, 88, 8, 'woodLight', 2), circle(70, 80, 6, 'green'), rect(64, 80, 12, 8, 'brick', 1.5, 2)))

item('key', 'home', 'ключ', 'кілт', 'key', ['ключ', 'кілт', 'key$', 'keys'], ['home', 'symbol', 'travel'], 'hand', group('rotate(-35 50 52)',
    circle(30, 52, 18, 'amber'), circle(30, 52, 8, 'paper'), circle(26, 46, 3, 'yellow', 0), rect(46, 47, 42, 10, 'amber', 3),
    rect(70, 56, 6, 12, 'amber', 1.5, 2.5), rect(80, 56, 6, 9, 'amber', 1.5, 2.5), rect(48, 49, 36, 3, 'yellow', 1.5, 0)).join([
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" stroke-linejoin="round" stroke-linecap="round">', '</svg>']))

item('tv', 'home', 'телевизор', 'теледидар', 'tv', ['телевиз', 'телик', 'сериал', 'мультик', 'теледидар', 'tv$', 'television'], ['home', 'rest', 'evening', 'tech'], 'ground', svg(
    tube('M40 20 L30 4 M60 20 L72 6', 'slateDark', 2), rect(10, 20, 80, 58, 'brown', 6), rect(16, 26, 56, 46, 'tealDark', 4, 2),
    line('M22 60 Q36 40 50 54 Q60 64 66 44', 'mint', 3), circle(56, 36, 5, 'yellow', 0),
    circle(81, 38, 4, 'ochre', 2), circle(81, 52, 4, 'ochre', 2), rect(22, 78, 8, 14, 'brownDark', 1, 2), rect(70, 78, 8, 14, 'brownDark', 1, 2)), fx=['glow'])

item('armchair', 'home', 'кресло', 'кресло', 'armchair', ['кресл', 'armchair'], ['home', 'rest', 'calm', 'warm'], 'ground', svg(
    rect(22, 84, 6, 10, 'brown', 1, 2), rect(72, 84, 6, 10, 'brown', 1, 2),
    rect(22, 14, 56, 54, 'teal', 14), fill('M62 16 Q78 18 78 34 L78 66 L68 66 Q70 36 62 16 Z', 'tealDark'),
    rect(20, 58, 60, 28, 'teal', 6), rect(24, 56, 52, 12, 'mint', 5, 2),
    rect(8, 40, 18, 46, 'teal', 8), rect(74, 40, 18, 46, 'tealDark', 8), line('M50 22 L50 50', 'tealDark', 2)))

item('pillow', 'home', 'подушка', 'жастық', 'pillow', ['подушк', 'жастық', 'pillow'], ['home', 'night', 'rest', 'calm', 'warm'], 'both', svg(
    shape('M12 30 Q30 22 50 26 Q70 22 88 30 Q82 52 88 74 Q70 82 50 78 Q30 82 12 74 Q18 52 12 30 Z', 'peach'),
    fill('M70 24 Q80 26 88 30 Q82 52 88 74 Q80 78 72 79 Q80 52 70 24 Z', 'coral'),
    line('M26 40 Q34 36 40 40', 'white', 3), *[circle(x, y, 2.2, 'white', 0) for x, y in [(36, 56), (52, 46), (60, 62), (44, 66)]],
    circle(50, 52, 3.5, 'coral', 2)))

item('blanket', 'home', 'плед', 'көрпе', 'blanket', ['плед', 'одеял', 'көрпе', 'укутал', 'укутав', 'blanket'], ['home', 'warm', 'winter', 'calm', 'rest'], 'both', svg(
    shape('M10 40 Q50 30 90 40 L90 70 Q70 80 50 74 Q30 80 10 70 Z', 'brick'),
    *[line(f'M{x} 36 L{x} 76', 'brickDark', 3) for x in (30, 50, 70)], line('M10 50 Q50 40 90 50 M10 62 Q50 54 90 62', 'coral', 3),
    out('M10 40 Q50 30 90 40 L90 70 Q70 80 50 74 Q30 80 10 70 Z'),
    shape('M10 70 Q30 80 50 74 Q70 80 90 70 L90 82 Q70 94 50 86 Q30 94 10 82 Z', 'cream'),
    *[line(f'M{x} 84 L{x} 94', 'cream', 2.5) for x in range(14, 90, 8)]))

item('photo_frame', 'home', 'фото в рамке', 'фоторамка', 'photo frame', ['фотограф', 'фотк', 'снимок', 'снимк', 'рамк', 'сурет', 'photo'], ['home', 'memory', 'family', 'love'], 'hand', svg(
    rect(16, 10, 68, 80, 'woodLight', 3), rect(24, 18, 52, 62, 'white', 1, 2), rect(28, 22, 44, 44, 'ice', 1, 0),
    shape('M28 66 L40 46 L50 58 L58 50 L72 66 Z', 'greenSoft', 0), circle(60, 34, 5, 'yellow', 0), ell(40, 30, 7, 3, 'white', 0),
    rect(32, 70, 36, 4, 'paperShade', 1, 0), rect(76, 16, 6, 68, 'wood', 0, 0)))

item('mirror', 'home', 'зеркало', 'айна', 'mirror', ['зеркал', 'отражен', 'айна', 'mirror'], ['home', 'morning', 'calm'], 'both', svg(
    ell(50, 46, 30, 38, 'ochre'), ell(50, 46, 24, 32, 'ice'), line('M36 30 L44 22 M36 44 L52 28', 'white', 3.5),
    *[circle(round(x, 1), round(y, 1), 2.5, 'amber', 1.5) for x, y in [(50, 7), (21, 30), (79, 30), (21, 62), (79, 62)]],
    rect(44, 82, 12, 6, 'ochre', 1, 2), ell(50, 92, 18, 4, 'ochre')))

item('pencil', 'study', 'карандаш', 'қарындаш', 'pencil', ['карандаш', 'рисовал', 'рисова', 'рисунок', 'рисунк', 'қарындаш', 'сурет салу', 'pencil', 'drawing'], ['study', 'school', 'calm'], 'hand', group('rotate(-40 50 50)',
    rect(14, 42, 58, 16, 'amber', 1), rect(14, 50, 58, 8, 'ochre', 0, 0), out('M14 42 L72 42 L72 58 L14 58'), line('M14 50 L72 50', 'ochre', 1.4),
    poly([(72, 42), (90, 50), (72, 58)], 'paper'), poly([(84, 47), (90, 50), (84, 53)], 'ink', 0),
    rect(4, 42, 12, 16, 'peach', 2), rect(14, 42, 5, 16, 'greyLight', 0, 2)).join([
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" stroke-linejoin="round" stroke-linecap="round">', '</svg>']))

item('notebook', 'study', 'тетрадь', 'дәптер', 'notebook', ['тетрад', 'блокнот', 'конспект', 'домашк', 'дәптер', 'notebook', 'homework'], ['study', 'school', 'work', 'calm'], 'hand', svg(
    rect(18, 8, 64, 86, 'teal', 4), rect(68, 10, 13, 82, 'tealDark', 0, 0), rect(26, 8, 56, 86, 'teal', 4).replace(f'fill="{H["teal"]}"', 'fill="none"'),
    *[ell(18, y, 5, 3, 'greyLight', 2) for y in range(16, 92, 10)], rect(34, 24, 36, 16, 'white', 2, 2),
    line('M38 30 L64 30 M38 35 L56 35', 'greyBlue', 1.6), poly(star_pts(52, 64, 10, 4.5), 'yellow', 2)))

item('glasses', 'study', 'очки', 'көзілдірік', 'glasses', ['очки', 'очков', 'очках', 'көзілдірік', 'glasses'], ['study', 'work', 'calm'], 'hand', svg(
    tube('M8 44 L16 40 M92 44 L84 40', 'slateDark', 2.5), tube('M42 46 Q50 40 58 46', 'slateDark', 2.5),
    circle(28, 50, 15, 'ice', 4), circle(72, 50, 15, 'ice', 4), circle(28, 50, 15, 'slateDark', 0).replace(f'fill="{H["slateDark"]}"', f'fill="none" stroke="{H["slateDark"]}" stroke-width="2"'),
    line('M20 46 L28 38 M22 54 L34 42', 'white', 2.5), line('M64 46 L72 38 M66 54 L78 42', 'white', 2.5)))

item('paint', 'study', 'краски', 'бояу', 'paints', ['краск', 'красил', 'палитр', 'кисточк', 'кисть', 'бояу', 'paint', 'art$'], ['study', 'joy', 'calm', 'home'], 'both', svg(
    shape('M50 12 Q90 12 92 46 Q94 70 72 72 Q60 72 60 82 Q58 94 42 92 Q8 88 8 52 Q8 12 50 12 Z', 'woodLight'),
    fill('M78 18 Q92 30 92 46 Q94 70 72 72 Q80 50 78 18 Z', 'wood'), circle(30, 76, 7, 'paper'),
    *[circle(x, y, 7, c, 2) for x, y, c in [(28, 36, 'brick'), (48, 26, 'yellow'), (68, 32, 'teal'), (24, 56, 'greenSoft'), (76, 52, 'mauve')]],
    tube('M44 70 L82 92', 'brown', 3), shape('M38 64 L46 62 L48 70 L42 74 Z', 'coral')))

item('ruler', 'study', 'линейка', 'сызғыш', 'ruler', ['линейк', 'сызғыш', 'ruler'], ['study', 'school', 'work'], 'hand', group('rotate(-30 50 50)',
    rect(6, 40, 88, 20, 'yellow', 2), rect(6, 52, 88, 8, 'amber', 0, 0), out('M6 40 L94 40 L94 60 L6 60 Z'),
    *[line(f'M{x} 40 L{x} {48 if i % 2 else 52}', 'ink', 1.6) for i, x in enumerate(range(12, 92, 6))]).join([
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" stroke-linejoin="round" stroke-linecap="round">', '</svg>']))

item('envelope', 'study', 'письмо', 'хат', 'letter', ['письм', 'конверт', 'открытк', 'хат$', 'хатты', 'letter', 'mail'], ['love', 'friends', 'memory', 'family'], 'hand', svg(
    rect(10, 26, 80, 54, 'white', 3), fill('M70 28 L90 28 L90 78 L70 78 Q76 52 70 28 Z', 'paper'), out('M10 26 L90 26 L90 80 L10 80 Z'),
    shape('M10 26 L50 58 L90 26', 'paper', 2.5), line('M10 80 L40 52 M90 80 L60 52', 'paperShade', 2),
    f'<path d="M44 52 C44 47 50 47 50 51 C50 47 56 47 56 52 C56 57 50 61 50 61 C50 61 44 57 44 52 Z" fill="{H["brick"]}"{st(2)}/>'))

item('camera', 'study', 'фотоаппарат', 'фотоаппарат', 'camera', ['фотоаппарат', 'камер', 'сфоткал', 'сфотограф', 'фотоапп', 'camera'], ['travel', 'memory', 'friends', 'tech'], 'hand', svg(
    rect(10, 30, 80, 56, 'slateDark', 8), rect(10, 44, 80, 30, 'woodLight', 0, 2), rect(30, 20, 26, 12, 'slate', 3),
    circle(50, 58, 20, 'greyLight'), circle(50, 58, 14, 'navy'), circle(50, 58, 8, 'slate', 0), circle(45, 53, 3.5, 'white', 0),
    rect(70, 34, 12, 7, 'yellow', 2, 2), circle(20, 38, 3, 'brick', 1.8), rect(10, 74, 80, 12, 'slateDark', 0, 0).replace('<rect', '<rect opacity="0"')))

item('globe', 'study', 'глобус', 'глобус', 'globe', ['глобус', 'карта мира', 'география', 'globe'], ['study', 'travel', 'school'], 'hand', svg(
    ell(50, 92, 20, 5, 'brown'), rect(46, 72, 8, 20, 'wood', 1, 2),
    tube('M22 30 A34 34 0 0 0 66 82', 'ochre', 3), circle(48, 46, 28, 'teal'), circle(45.5, 43.5, 24, 'teal', 0),
    shape('M34 30 Q44 26 48 34 Q46 44 38 42 Q30 40 34 30 Z', 'greenSoft', 2), shape('M52 46 Q64 42 66 52 Q60 64 52 62 Q48 54 52 46 Z', 'greenSoft', 2),
    shape('M30 54 Q36 52 38 58 Q34 64 30 60 Z', 'green', 2), ell(38, 30, 6, 3, 'ice', 0, -30), circle(48, 46, 28, 'teal').replace(f'fill="{H["teal"]}"', 'fill="none"')))

write_meta('pic5')
