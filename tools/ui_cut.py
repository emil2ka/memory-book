#!/usr/bin/env python3
"""Нарезка заготовок интерфейса «канцелярия» из листов ChatGPT (assets/_raw/ui/tex/*_raw.png)
в assets/ui/*.webp + assets/ui/metrics.json (поля для border-image и накладок).
Запуск: python3 tools/ui_cut.py"""
import json
import os
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..')
RAW = os.path.join(ROOT, 'assets/_raw/ui/tex')
OUT = os.path.join(ROOT, 'assets/ui')
os.makedirs(OUT, exist_ok=True)
metrics = {}


def load(name):
    im = Image.open(os.path.join(RAW, name)).convert('RGBA')
    # чистим полупрозрачную пыль вокруг объектов
    a = im.split()[-1].point(lambda v: 0 if v < 24 else v)
    im.putalpha(a)
    return im


def runs(profile, min_gap):
    """Отрезки, где profile > 0, разделённые пустотами не короче min_gap."""
    out, start, gap = [], None, 0
    for i, v in enumerate(profile):
        if v:
            if start is None:
                start = i
            gap, end = 0, i
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                out.append((start, end + 1))
                start, gap = None, 0
    if start is not None:
        out.append((start, end + 1))
    return out


def alpha_rows(im, box=None):
    a = im.split()[-1] if box is None else im.crop(box).split()[-1]
    w, h = a.size
    px = a.load()
    return [sum(1 for x in range(0, w, 2) if px[x, y] > 40) > 2 for y in range(h)]


def alpha_cols(im, box=None):
    a = im.split()[-1] if box is None else im.crop(box).split()[-1]
    w, h = a.size
    px = a.load()
    return [sum(1 for y in range(0, h, 2) if px[x, y] > 40) > 2 for x in range(w)]


def tight(im):
    bb = im.split()[-1].point(lambda v: 255 if v > 40 else 0).getbbox()
    return im.crop(bb)


def save(im, name, width=None, height=None, q=86):
    if width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    elif height:
        im = im.resize((round(im.width * height / im.height), height), Image.LANCZOS)
    path = os.path.join(OUT, name)
    im.save(path, 'WEBP', quality=q, method=6)
    print(f'{name:22s} {im.width}x{im.height}  {os.path.getsize(path) // 1024} KB')
    return im


# --- a: сургуч ---
seal = save(tight(load('a_seal_raw.png')), 'seal.webp', width=420)
# центр воска: средняя точка строки самой широкой части верхних 75%
a = seal.split()[-1].load()
best = max(range(int(seal.height * 0.75)), key=lambda y: sum(1 for x in range(seal.width) if a[x, y] > 128))
metrics['seal'] = {'w': seal.width, 'h': seal.height, 'waxCy': round(best / seal.width, 3)}

# --- b, c, d: бирка, флажок, карточка (стопкой) ---
sheet = load('bcd_tags_raw.png')
rows = runs(alpha_rows(sheet), 20)
assert len(rows) == 3, rows
tag, flag, card = [tight(sheet.crop((0, y0, sheet.width, y1))) for y0, y1 in rows]

# бирка: бумажная полоса (без свисающей бечёвки) + накладка с бантом слева
ta = tag.split()[-1].load()
col = int(tag.width * 0.6)
ys = [y for y in range(tag.height) if ta[col, y] > 128]
yT, yB = ys[0], ys[-1] + 1
xs = [x for x in range(tag.width) if ta[x, (yT + yB) // 2] > 128]
row_mid = (yT + yB) // 2
# левый край бумаги — первый столбец, где непрозрачна почти вся полоса yT..yB+ (срезанный угол начинается раньше)
paper_left = next(x for x in range(tag.width) if sum(1 for y in range(yT, yB) if ta[x, y] > 128) > (yB - yT) * 0.35)
k = 300 / (yB - yT)  # высота полосы бумаги в файле 300 px (бирка 68 css px × ~4)
tag_s = tag.resize((round(tag.width * k), round(tag.height * k)), Image.LANCZOS)
yT2, yB2, pl2 = round(yT * k), round(yB * k), round(paper_left * k)
strip = tag_s.crop((pl2, yT2, tag_s.width, yB2))
save(strip, 'tag_strip.webp')
# левая часть с люверсом и бантом: до конца бечёвки справа от люверса
cols = alpha_cols(tag_s, (0, 0, tag_s.width, yT2))  # бечёвка выше бумаги
cols_b = alpha_cols(tag_s, (0, yB2, tag_s.width, tag_s.height))  # и ниже
bow_right = max([i for i, v in enumerate(cols) if v] + [i for i, v in enumerate(cols_b) if v] + [pl2 + 60]) + 12
bow = tag_s.crop((0, 0, bow_right, tag_s.height))
save(bow, 'tag_bow.webp')
metrics['tag'] = {
    'stripW': strip.width, 'stripH': strip.height,
    'sliceL': bow_right - pl2, 'sliceR': 40,
    'bowW': bow.width, 'bowH': bow.height, 'bowTop': yT2, 'bowLeft': pl2,
}

flag = save(flag, 'flag.webp', height=180)
fa = flag.split()[-1].load()
mid = flag.height // 2
right_mid = max(x for x in range(flag.width) if fa[x, mid] > 128)
right_top = max(x for x in range(flag.width) if fa[x, 6] > 128)
metrics['flag'] = {'w': flag.width, 'h': flag.height, 'sliceL': 30, 'sliceR': flag.width - right_mid + 30, 'tail': right_top - right_mid}

card = save(card, 'card.webp', width=220)
metrics['card'] = {'w': card.width, 'h': card.height}

# --- e, f, g: скотч, записка, кнопка, скрепка, кисточка ---
small = load('efg_small_raw.png')
rows = runs(alpha_rows(small), 20)
assert len(rows) == 2, rows
top = small.crop((0, rows[0][0], small.width, rows[0][1]))
bottom = small.crop((0, rows[1][0], small.width, rows[1][1]))
tapes = [tight(top.crop((x0, 0, x1, top.height))) for x0, x1 in runs(alpha_cols(top), 3)]
assert len(tapes) == 5, len(tapes)
for im, n in zip(tapes, ['tape_green', 'tape_red', 'tape_mustard', 'tape_pink', 'tape_mint']):
    save(im, n + '.webp', height=56)
objs = [tight(bottom.crop((x0, 0, x1, bottom.height))) for x0, x1 in runs(alpha_cols(bottom), 10)]
assert len(objs) == 4, len(objs)
save(objs[0], 'note.webp', width=360)
save(objs[1], 'pin.webp', width=64)
save(objs[2], 'clip.webp', height=150)
save(objs[3], 'tassel.webp', height=260)

# --- g: закладка ---
bm = save(tight(load('g_bookmark_raw.png')), 'bookmark.webp', width=340)
ba = bm.split()[-1].load()
notch = min(y for y in range(bm.height) if ba[bm.width // 2, y] < 60 and y > bm.height * 0.6)
metrics['bookmark'] = {'w': bm.width, 'h': bm.height, 'sliceT': 60, 'sliceB': bm.height - notch + 40}

# --- h: кассета ---
cas = save(tight(load('h_cassette_raw.png')), 'cassette.webp', width=720, q=84)
metrics['cassette'] = {'w': cas.width, 'h': cas.height}

# --- i: бумага, нормированная к средней яркости (умножается на цвет листа) ---
p = os.path.join(RAW, 'i_paper_raw.png')
if os.path.exists(p):
    paper = Image.open(p).convert('RGB')
    s = min(paper.size)
    paper = paper.crop((0, 0, s, s)).resize((512, 512), Image.LANCZOS)
    # бесшовность: смешиваем со сдвигом на полтайла по краям
    shifted = Image.fromarray(__import__('numpy').roll(__import__('numpy').asarray(paper), (256, 256), axis=(0, 1)))
    mask = Image.new('L', (512, 512), 0)
    mp = mask.load()
    for y in range(512):
        for x in range(512):
            d = min(x, y, 511 - x, 511 - y)
            mp[x, y] = max(0, 255 - d * 4)
    paper = Image.composite(shifted, paper, mask)
    import numpy as np
    arr = np.asarray(paper).astype(np.float32)
    arr = arr / arr.reshape(-1, 3).mean(0) * 232  # средний тон ≈ 232: почти белый, умножение почти не темнит
    arr = arr.clip(0, 255).astype(np.uint8)
    paper = Image.fromarray(arr)
    paper.save(os.path.join(OUT, 'paper.webp'), 'WEBP', quality=80, method=6)
    print('paper.webp', os.path.getsize(os.path.join(OUT, 'paper.webp')) // 1024, 'KB')

json.dump(metrics, open(os.path.join(OUT, 'metrics.json'), 'w'), indent=1)
total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
print('metrics', json.dumps(metrics))
print('total', total // 1024, 'KB')
