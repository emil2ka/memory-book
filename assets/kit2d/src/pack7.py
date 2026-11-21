# Пачка 7 картинок: животные. Все — милые, глаза-точки, румянец.
from lib import *

def eyes(cx, cy, gap=12, e=2.4):
    return face(cx, cy, gap, e, 'coral', False)

item('bird', 'animals', 'птица', 'құс', 'bird', ['птиц', 'птичк', 'воробей', 'воробь', 'синиц', 'голуб', 'құс$', 'құстар', 'bird'], ['animal', 'nature', 'sky', 'spring', 'joy'], 'hand', svg(
    rect(10, 84, 80, 6, 'brown', 3), tube('M44 76 L42 84 M54 76 L56 84', 'amber', 1.6),
    shape('M22 56 Q22 30 46 28 Q70 28 74 50 Q78 76 50 78 Q28 78 22 56 Z', 'slate'), ell(50, 60, 16, 14, 'cream', 0),
    shape('M40 50 Q56 44 66 58 Q58 70 44 64 Z', 'slateDark', 2), shape('M22 54 L6 46 L10 60 Z', 'slateDark', 2),
    poly([(72, 40), (84, 44), (72, 48)], 'amber', 2), ell(62, 40, 2.4, 3, 'ink', 0), circle(63, 39, 0.9, 'white', 0), ell(58, 48, 3, 1.8, 'coral', 0)), fx=['bob'])

item('fish', 'animals', 'рыбка', 'балық', 'fish', ['рыб', 'рыбк', 'рыбал', 'балық', 'fish'], ['animal', 'water', 'nature', 'calm', 'summer'], 'hand', svg(
    shape('M70 50 L92 32 L90 68 Z', 'coral'), shape('M10 50 Q24 24 54 26 Q76 30 76 50 Q76 70 54 74 Q24 76 10 50 Z', 'amber'),
    fill('M54 26 Q76 30 76 50 Q76 70 54 74 Q66 52 54 26 Z', 'coral'), shape('M42 28 Q50 14 60 26', 'coral', 2),
    *[line(f'M{x} 40 Q{x + 4} 50 {x} 60', 'ochre', 2) for x in (40, 50, 60)], ell(26, 46, 3, 3.6, 'ink', 0), circle(27, 45, 1, 'white', 0),
    *[circle(x, y, r, 'ice', 1.6) for x, y, r in [(10, 26, 4), (18, 14, 3)]]), fx=['bob'])

item('butterfly', 'animals', 'бабочка', 'көбелек', 'butterfly', ['бабочк', 'мотыл', 'көбелек', 'butterfly'], ['animal', 'nature', 'spring', 'summer', 'joy', 'dream'], 'hand', svg(
    shape('M48 46 Q24 8 10 24 Q2 40 46 52 Z', 'mauve'), shape('M52 46 Q76 8 90 24 Q98 40 54 52 Z', 'mauve'),
    shape('M46 54 Q12 56 18 76 Q30 88 48 60 Z', 'peach'), shape('M54 54 Q88 56 82 76 Q70 88 52 60 Z', 'peach'),
    circle(24, 28, 6, 'yellow', 2), circle(76, 28, 6, 'yellow', 2), circle(28, 70, 4, 'white', 2), circle(72, 70, 4, 'white', 2),
    ell(50, 54, 5, 18, 'brownDark'), tube('M48 38 Q42 26 38 22 M52 38 Q58 26 62 22', 'brownDark', 1)), fx=['bob'])

item('bee', 'animals', 'пчела', 'ара', 'bee', ['пчел', 'шмел', 'мёд', 'мед$', 'меда', 'ара$', 'бал$', 'bee', 'honey'], ['animal', 'nature', 'summer', 'spring'], 'hand', svg(
    ell(36, 32, 14, 18, 'frost', 2.5, -25), ell(62, 30, 14, 18, 'frost', 2.5, 25),
    ell(50, 60, 32, 24, 'yellow'), *[rect(x, 38, 8, 44, 'ink', 0, 0) for x in (42, 58)], ell(50, 60, 32, 24, 'yellow').replace(f'fill="{H["yellow"]}"', 'fill="none"'),
    poly([(82, 58), (94, 60), (82, 64)], 'ink', 2), circle(28, 58, 13, 'yellow'), eyes(28, 56, 10, 2), f'<path d="M24 62 Q28 66 32 62" fill="none"{st(1.8)}/>',
    tube('M24 46 L18 34 M32 46 L36 34', 'ink', 1)), fx=['bob'])

item('rabbit', 'animals', 'зайчик', 'қоян', 'rabbit', ['заяц', 'зайц', 'зайчик', 'кролик', 'крольчон', 'қоян', 'rabbit', 'bunny'], ['animal', 'nature', 'spring', 'childhood', 'love'], 'ground', svg(
    ell(38, 22, 7, 20, 'white', 2.5, -10), ell(62, 22, 7, 20, 'white', 2.5, 10), ell(38, 24, 3, 13, 'peach', 0, -10), ell(62, 24, 3, 13, 'peach', 0, 10),
    ell(50, 76, 24, 20, 'white'), ell(76, 84, 7, 6, 'white'), ell(38, 94, 9, 4, 'white'), ell(62, 94, 9, 4, 'white'),
    circle(50, 52, 18, 'white'), ell(50, 80, 12, 12, 'frost', 0), eyes(50, 50), poly([(48, 56), (52, 56), (50, 58.5)], 'peach', 1.2),
    f'<path d="M50 58.5 Q48 61 46 60 M50 58.5 Q52 61 54 60" fill="none"{st(1.6)}/>'))

item('hedgehog', 'animals', 'ёжик', 'кірпі', 'hedgehog', ['ёж', 'еж$', 'ежик', 'ёжик', 'ежа$', 'кірпі', 'hedgehog'], ['animal', 'nature', 'autumn', 'forest', 'childhood'], 'ground', svg(
    shape('M14 82 Q8 52 30 38 L36 26 L42 34 L50 22 L56 34 L64 26 L66 38 Q90 48 88 82 Z', 'brown'),
    *[line(f'M{x} {y} L{x + 6} {y - 10}', 'brownDark', 2.4) for x, y in [(24, 60), (34, 50), (46, 44), (58, 46), (70, 54), (78, 66), (30, 72), (44, 62), (60, 64)]],
    shape('M70 82 Q72 58 84 60 Q96 66 94 82 Z', 'peach'), circle(94, 74, 3, 'ink', 0), circle(84, 68, 2.2, 'ink', 0), ell(86, 76, 3, 1.8, 'coral', 0),
    shape('M30 40 Q36 28 44 34 Q40 44 30 40 Z', 'brick', 2), ell(40, 88, 6, 4, 'peach'), ell(70, 88, 6, 4, 'peach')))

item('owl', 'animals', 'сова', 'үкі', 'owl', ['сова', 'совы', 'сову', 'филин', 'үкі', 'owl'], ['animal', 'night', 'study', 'calm', 'forest'], 'ground', svg(
    rect(10, 86, 80, 8, 'wood', 3),
    shape('M24 30 L20 12 L36 22 Q50 16 64 22 L80 12 L76 30 Q86 50 80 72 Q72 90 50 90 Q28 90 20 72 Q14 50 24 30 Z', 'wood'),
    ell(50, 66, 18, 20, 'cream', 0), *[f'<path d="M{x - 3} {y} Q{x} {y + 3} {x + 3} {y}" fill="none" stroke="{H["woodLight"]}" stroke-width="1.6"/>' for x, y in [(44, 60), (56, 60), (50, 68), (44, 76), (56, 76)]],
    circle(38, 40, 11, 'white'), circle(62, 40, 11, 'white'), circle(38, 41, 5, 'ink', 0), circle(62, 41, 5, 'ink', 0), circle(39.5, 39, 1.6, 'white', 0), circle(63.5, 39, 1.6, 'white', 0),
    poly([(46, 50), (54, 50), (50, 58)], 'amber', 2), shape('M20 50 Q12 66 24 80 Z', 'brown', 2), shape('M80 50 Q88 66 76 80 Z', 'brown', 2),
    tube('M40 88 L40 92 M60 88 L60 92', 'amber', 1.5)))

item('fox', 'animals', 'лиса', 'түлкі', 'fox', ['лис$', 'лиса', 'лисы', 'лису', 'лисиц', 'лисён', 'түлкі', 'fox'], ['animal', 'nature', 'forest', 'autumn'], 'ground', svg(
    shape('M68 82 Q96 78 92 54 Q88 40 78 46 Q84 62 66 70 Z', 'coral'), shape('M90 52 Q88 42 80 46 Q86 50 84 58 Z', 'white', 0),
    shape('M30 92 Q24 68 38 58 L62 58 Q76 68 70 92 Z', 'coral'), fill('M42 92 Q40 74 50 66 Q60 74 58 92 Z', 'white'),
    shape('M24 40 L20 12 L40 26 Q50 22 60 26 L80 12 L76 40 Q76 58 50 64 Q24 58 24 40 Z', 'coral'), poly([(26, 18), (36, 26), (28, 32)], 'brownDark', 0), poly([(74, 18), (64, 26), (72, 32)], 'brownDark', 0),
    shape('M28 44 Q40 46 50 64 Q60 46 72 44 Q74 58 50 64 Q26 58 28 44 Z', 'white', 0), out('M24 40 L20 12 L40 26 Q50 22 60 26 L80 12 L76 40 Q76 58 50 64 Q24 58 24 40 Z'),
    ell(40, 40, 2.4, 3, 'ink', 0), ell(60, 40, 2.4, 3, 'ink', 0), ell(50, 56, 3.5, 2.5, 'ink', 0), ell(34, 48, 3.5, 2, 'peach', 0), ell(66, 48, 3.5, 2, 'peach', 0)))

item('bear', 'animals', 'медведь', 'аю', 'bear', ['медвед', 'медвеж', 'аю$', 'аюды', 'bear'], ['animal', 'nature', 'forest', 'winter'], 'ground', svg(
    circle(26, 22, 10, 'brown'), circle(74, 22, 10, 'brown'), circle(26, 22, 5, 'woodLight', 0), circle(74, 22, 5, 'woodLight', 0),
    shape('M18 94 Q10 60 30 52 L70 52 Q90 60 82 94 Z', 'brown'), ell(50, 78, 16, 14, 'woodLight', 0), ell(28, 92, 10, 5, 'brown'), ell(72, 92, 10, 5, 'brown'),
    circle(50, 38, 24, 'brown'), ell(50, 48, 11, 8, 'woodLight', 2), ell(50, 44, 4.5, 3, 'ink', 0), eyes(50, 34, 16), f'<path d="M50 48 Q47 53 44 51 M50 48 Q53 53 56 51" fill="none"{st(1.6)}/>'))

item('sheep', 'animals', 'овечка', 'қой', 'sheep', ['овц', 'овеч', 'баран', 'ягнён', 'қой$', 'қойлар', 'қозы', 'sheep', 'lamb'], ['animal', 'kz', 'nature', 'calm', 'warm'], 'ground', svg(
    *[rect(x, 72, 6, 20, 'ink', 2, 0) for x in (30, 42, 58, 70)],
    ''.join(circle(x, y, r + 2.4, 'ink', 0) for x, y, r in [(30, 56, 14), (46, 48, 16), (64, 50, 15), (74, 62, 12), (50, 66, 14), (32, 70, 10)]),
    ''.join(circle(x, y, r, 'white', 0) for x, y, r in [(30, 56, 14), (46, 48, 16), (64, 50, 15), (74, 62, 12), (50, 66, 14), (32, 70, 10)]),
    circle(42, 44, 6, 'frost', 0), shape('M10 40 Q10 26 22 26 Q34 26 34 40 Q34 54 22 54 Q10 54 10 40 Z', 'greyLight'),
    ell(12, 32, 6, 4, 'greyLight', 2, -30), ell(32, 32, 6, 4, 'greyLight', 2, 30), eyes(22, 40, 10, 2), circle(22, 48, 2, 'ink', 0)))

item('cow', 'animals', 'корова', 'сиыр', 'cow', ['коров', 'бычок', 'телён', 'сиыр', 'cow'], ['animal', 'nature', 'kz', 'calm', 'food'], 'ground', svg(
    *[rect(x, 68, 7, 24, 'white', 2, 2.2) for x in (26, 38, 62, 74)], *[rect(x, 86, 7, 6, 'ink', 1, 0) for x in (26, 38, 62, 74)],
    shape('M18 48 Q18 36 32 36 L74 36 Q86 36 86 50 L86 64 Q86 72 76 72 L28 72 Q18 72 18 62 Z', 'white'),
    shape('M40 36 Q50 50 44 60 Q32 62 34 46 Z', 'ink', 0), shape('M66 50 Q76 48 78 60 Q70 66 64 60 Z', 'ink', 0), tube('M86 44 Q96 52 92 64', 'white', 2),
    shape('M4 28 Q4 14 18 14 Q32 14 32 28 L30 46 Q18 54 6 46 Z', 'white'), ell(18, 44, 12, 7, 'peach', 2), circle(14, 44, 1.6, 'ink', 0), circle(22, 44, 1.6, 'ink', 0),
    eyes(18, 28, 10, 2), shape('M6 14 Q2 6 8 4', 'amber', 2), shape('M30 14 Q34 6 28 4', 'amber', 2), rect(46, 72, 10, 6, 'peach', 3, 2)))

item('chicken', 'animals', 'курица', 'тауық', 'chicken', ['куриц', 'петух', 'цыпл', 'тауық', 'балапан', 'chicken', 'chick'], ['animal', 'nature', 'morning', 'home'], 'ground', svg(
    tube('M44 80 L42 92 M56 80 L58 92', 'amber', 1.8),
    shape('M20 58 Q16 34 40 30 Q44 18 56 18 Q68 18 68 32 Q86 40 82 62 Q78 84 50 84 Q24 84 20 58 Z', 'white'),
    shape('M20 58 L6 44 L12 62 Z', 'white', 2), shape('M40 52 Q58 48 66 62 Q56 74 42 66 Z', 'cream', 2),
    shape('M50 18 Q52 8 58 12 Q60 4 66 10 Q70 12 64 20 Z', 'brick', 2), poly([(68, 30), (80, 34), (68, 38)], 'amber', 2), ell(66, 42, 3, 5, 'brick', 2),
    ell(60, 28, 2.4, 3, 'ink', 0), ell(56, 36, 3, 1.8, 'coral', 0)))

item('duck', 'animals', 'утка', 'үйрек', 'duck', ['утк', 'утён', 'утят', 'үйрек', 'duck'], ['animal', 'water', 'nature', 'park', 'summer'], 'both', svg(
    line('M4 90 Q20 84 36 90 Q52 96 68 90 Q84 84 96 90', 'teal', 3),
    shape('M14 64 Q12 44 34 44 L60 46 Q86 44 88 64 Q86 84 50 84 Q14 84 14 64 Z', 'yellow'), shape('M32 62 Q48 54 64 66 Q52 76 36 70 Z', 'amber', 2),
    shape('M86 60 L96 48 L92 66 Z', 'yellow', 2), circle(30, 32, 16, 'yellow'), shape('M10 34 Q4 32 4 38 Q6 42 16 40 Z', 'amber', 2),
    ell(28, 28, 2.4, 3, 'ink', 0), ell(24, 36, 3, 1.8, 'coral', 0), shape('M28 16 Q30 10 36 12', 'yellow', 2)), fx=['bob'])

item('frog', 'animals', 'лягушка', 'бақа', 'frog', ['лягушк', 'лягуш', 'жаба', 'бақа', 'frog'], ['animal', 'water', 'nature', 'summer', 'rain'], 'hand', svg(
    ell(50, 86, 40, 8, 'greenSoft'), ell(50, 66, 30, 22, 'green'), ell(50, 72, 18, 12, 'mint', 0),
    circle(32, 40, 11, 'green'), circle(68, 40, 11, 'green'), circle(32, 40, 6, 'white', 0), circle(68, 40, 6, 'white', 0), circle(33, 41, 3.5, 'ink', 0), circle(69, 41, 3.5, 'ink', 0),
    f'<path d="M36 60 Q50 70 64 60" fill="none"{st(2.2)}/>', ell(28, 58, 4, 2.2, 'coral', 0), ell(72, 58, 4, 2.2, 'coral', 0),
    ell(24, 86, 9, 4, 'green'), ell(76, 86, 9, 4, 'green')))

item('turtle', 'animals', 'черепаха', 'тасбақа', 'turtle', ['черепах', 'тасбақа', 'turtle'], ['animal', 'calm', 'nature', 'water'], 'both', svg(
    *[ell(x, 82, 7, 6, 'greenSoft') for x in (26, 70)], shape('M78 66 Q96 58 94 72 Q90 80 78 76 Z', 'greenSoft'), ell(88, 66, 2, 2.5, 'ink', 0),
    shape('M14 76 Q14 30 50 30 Q86 30 86 76 Z', 'green'), fill('M66 34 Q86 44 86 76 L72 76 Q76 50 66 34 Z', 'greenDark'),
    poly([(50, 40), (62, 48), (58, 62), (42, 62), (38, 48)], 'greenSoft', 2), line('M50 40 L50 30 M62 48 L78 44 M58 62 L66 76 M42 62 L34 76 M38 48 L22 44', 'greenDark', 2),
    rect(12, 72, 76, 6, 'mint', 3)))

item('snail', 'animals', 'улитка', 'ұлу', 'snail', ['улитк', 'ұлу', 'snail'], ['animal', 'calm', 'rain', 'nature'], 'hand', svg(
    shape('M8 86 Q8 76 20 76 L84 76 Q92 76 92 66 L92 50 Q96 44 92 40', 'peach', 2.5), shape('M8 86 L88 86 Q96 86 94 74 L92 50 Q84 50 84 64 L84 76 L14 76 Q8 78 8 86 Z', 'peach'),
    tube('M86 44 L82 30 M94 44 L98 32', 'peach', 1.5), circle(82, 30, 2.5, 'ink', 0), circle(98, 32, 2.5, 'ink', 0),
    circle(46, 52, 26, 'amber'), f'<path d="M46 52 Q46 44 54 46 Q62 52 54 60 Q44 66 36 56 Q30 42 44 34 Q60 28 68 42" fill="none"{st(2.4)}/>', ell(36, 40, 4, 6, 'yellow', 0, 30)))

item('squirrel', 'animals', 'белка', 'тиін', 'squirrel', ['белк', 'бельчон', 'тиін', 'squirrel'], ['animal', 'nature', 'forest', 'autumn', 'park'], 'ground', svg(
    shape('M60 88 Q96 84 92 50 Q90 20 66 24 Q80 34 74 50 Q68 66 60 70 Z', 'coral'), shape('M70 30 Q84 34 84 52 Q84 66 72 74 Q80 56 70 30 Z', 'amber', 0),
    shape('M26 92 Q20 66 34 56 L54 56 Q66 66 62 92 Z', 'coral'), ell(44, 78, 9, 12, 'cream', 0),
    shape('M22 44 Q22 26 40 26 Q58 26 58 44 Q58 58 40 58 Q22 58 22 44 Z', 'coral'), poly([(26, 30), (24, 16), (34, 26)], 'coral', 2), poly([(54, 30), (56, 16), (46, 26)], 'coral', 2),
    ell(32, 42, 2.4, 3, 'ink', 0), ell(48, 42, 2.4, 3, 'ink', 0), circle(40, 49, 2, 'ink', 0), ell(28, 50, 3, 1.8, 'peach', 0), ell(52, 50, 3, 1.8, 'peach', 0),
    ell(42, 66, 6, 7, 'brown', 2), shape('M38 60 Q42 56 46 60 Z', 'brownDark', 1.6)))

item('penguin', 'animals', 'пингвин', 'пингвин', 'penguin', ['пингвин', 'penguin'], ['animal', 'cold', 'winter', 'water'], 'ground', svg(
    ell(38, 92, 9, 4, 'amber'), ell(62, 92, 9, 4, 'amber'),
    shape('M50 8 Q80 10 80 54 Q80 90 50 90 Q20 90 20 54 Q20 10 50 8 Z', 'navy'), shape('M50 26 Q70 30 68 58 Q66 84 50 84 Q34 84 32 58 Q30 30 50 26 Z', 'white', 0),
    shape('M20 44 Q8 60 14 74 L24 64 Z', 'navy', 2), shape('M80 44 Q92 60 86 74 L76 64 Z', 'navy', 2),
    ell(42, 36, 2.4, 3, 'ink', 0), ell(58, 36, 2.4, 3, 'ink', 0), poly([(44, 42), (56, 42), (50, 50)], 'amber', 2), ell(38, 46, 3, 1.8, 'peach', 0), ell(62, 46, 3, 1.8, 'peach', 0),
    rect(32, 54, 36, 6, 'brick', 3, 2)))

item('parrot', 'animals', 'попугай', 'тотықұс', 'parrot', ['попуга', 'тотықұс', 'parrot'], ['animal', 'joy', 'home', 'summer'], 'hand', svg(
    rect(10, 72, 80, 6, 'wood', 3), shape('M44 76 L38 98 L46 96 L50 76 Z', 'teal', 2), shape('M52 76 L58 98 L50 96 L48 76 Z', 'slate', 2),
    shape('M30 50 Q28 22 48 18 Q68 16 70 40 Q72 70 50 76 Q32 76 30 50 Z', 'greenSoft'), shape('M34 54 Q46 42 60 50 Q58 70 44 72 Z', 'green', 2),
    shape('M48 18 Q38 6 44 2 Q52 8 54 18 Z', 'brick', 2), shape('M62 30 Q78 30 74 44 Q70 40 62 40 Z', 'amber', 2),
    circle(56, 30, 5, 'white', 2), circle(57, 30, 2.2, 'ink', 0), ell(48, 42, 4, 2.2, 'coral', 0)))

item('ladybug', 'animals', 'божья коровка', 'қызыл қоңыз', 'ladybug', ['божь коровк', 'коровк', 'жучок', 'жучк', 'жук$', 'қоңыз', 'ladybug', 'bug'], ['animal', 'nature', 'summer', 'joy', 'spring'], 'hand', svg(
    shape('M12 84 Q30 92 50 88 Q72 92 88 84', 'greenSoft', 0).replace(f'fill="{H["greenSoft"]}"', 'fill="none"'),
    shape('M10 90 Q20 80 34 86 Q44 76 56 84 Q70 78 90 90 Z', 'greenSoft'),
    circle(50, 30, 14, 'ink'), circle(44, 28, 3, 'white', 0), circle(56, 28, 3, 'white', 0), tube('M44 18 L38 8 M56 18 L62 8', 'ink', 0.5),
    shape('M16 62 Q16 34 50 34 Q84 34 84 62 Q84 84 50 84 Q16 84 16 62 Z', 'brick'), fill('M66 38 Q84 46 84 62 Q84 82 56 84 Q76 66 66 38 Z', 'brickDark'),
    line('M50 34 L50 84', 'ink', 2.5), *[circle(x, y, r, 'ink', 0) for x, y, r in [(34, 50, 5), (66, 50, 5), (30, 68, 4), (70, 68, 4), (42, 76, 3.5), (58, 76, 3.5)]],
    ell(28, 46, 3, 5, 'coral', 0, 30)))

item('mouse', 'animals', 'мышка', 'тышқан', 'mouse', ['мыш', 'мышон', 'тышқан', 'mouse'], ['animal', 'home', 'childhood'], 'hand', svg(
    tube('M74 80 Q92 80 92 64 Q92 52 84 56', 'peach', 2),
    circle(30, 30, 14, 'greyLight'), circle(70, 30, 14, 'greyLight'), circle(30, 30, 8, 'peach', 0), circle(70, 30, 8, 'peach', 0),
    shape('M20 84 Q14 56 30 48 L70 48 Q86 56 80 84 Z', 'greyLight'), ell(50, 72, 14, 12, 'white', 0),
    circle(50, 48, 20, 'greyLight'), eyes(50, 46, 14), ell(50, 56, 3, 2.4, 'peach', 1.4), line('M40 58 L28 56 M40 61 L28 63 M60 58 L72 56 M60 61 L72 63', 'ink', 1.2),
    ell(36, 86, 8, 4, 'peach'), ell(64, 86, 8, 4, 'peach')))

item('whale', 'animals', 'кит', 'кит', 'whale', ['кит$', 'кита$', 'киты', 'китов', 'whale'], ['animal', 'water', 'calm', 'dream'], 'both', svg(
    tube('M50 22 Q46 10 40 8 M50 22 Q54 10 60 8', 'ice', 2.5), circle(40, 8, 3, 'frost', 1.6), circle(60, 8, 3, 'frost', 1.6),
    shape('M78 56 L96 38 L94 66 Z', 'slate'), shape('M8 62 Q8 26 46 26 Q82 26 82 60 Q82 86 46 86 Q8 86 8 62 Z', 'slate'),
    shape('M14 70 Q40 90 78 70 Q72 86 46 86 Q18 86 14 70 Z', 'ice', 0), out('M8 62 Q8 26 46 26 Q82 26 82 60 Q82 86 46 86 Q8 86 8 62 Z'),
    *[line(f'M{x} 74 L{x + 2} 82', 'greyBlue', 1.6) for x in (24, 34, 44, 54, 64)], eyes(30, 54, 16), f'<path d="M24 64 Q30 68 36 64" fill="none"{st(2)}/>',
    ell(30, 38, 8, 4, 'greyBlue', 0, -20)), fx=['bob'])

item('lamb_toy', 'animals', 'верблюжонок', 'бота', 'baby camel', ['верблюжон', 'бота$', 'ботақан'], ['animal', 'kz', 'childhood', 'love', 'nature'], 'ground', svg(
    *[rect(x, 64, 6, 26, 'woodLight', 2, 2.2) for x in (30, 40, 60, 70)], *[ell(x + 3, 91, 5, 3, 'ochre') for x in (30, 40, 60, 70)],
    shape('M24 54 Q24 42 36 42 L72 42 Q82 44 80 56 Q78 68 68 68 L34 68 Q24 66 24 54 Z', 'woodLight'), shape('M42 44 Q48 26 56 26 Q64 26 64 44 Z', 'woodLight'),
    shape('M72 48 Q78 32 80 24 Q82 14 90 16 Q98 18 96 28 Q94 32 86 30 Q82 40 82 52 Z', 'woodLight'),
    ell(88, 21, 2, 2.6, 'ink', 0), ell(90, 27, 2.5, 1.5, 'coral', 0), shape('M84 14 L84 8 L89 12 Z', 'woodLight', 2), tube('M24 50 Q16 56 18 66', 'ochre', 2),
    rect(46, 42, 12, 10, 'brick', 1, 2), *[circle(x, 47, 1.4, 'yellow', 0) for x in (49, 55)]))

write_meta('pic7')
