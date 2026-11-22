#!/usr/bin/env python3
"""Нарезка иконок «канцелярии» из листа ChatGPT 4×4 (assets/_raw/ui/tex/j_icons_raw.png)
в assets/ui/icons/<имя>.webp — 96×96, прозрачный фон, иконка по центру.
Порядок клеток — как в промпте (assets/_raw/ui/tex/prompts.json, ключ j_icons).
Запуск: python3 tools/icon_cut.py [путь к листу]"""
import os
import sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'assets/_raw/ui/tex/j_icons_raw.png')
OUT = os.path.join(ROOT, 'assets/ui/icons')
NAMES = ['replay', 'download', 'trash', 'pencil', 'save', 'check', 'plus', 'minus',
         'photo', 'note', 'heart', 'file', 'open', 'fold', 'book', 'link']
SIZE = 96

os.makedirs(OUT, exist_ok=True)
im = Image.open(SRC).convert('RGBA')
W, H = im.size

# фон не прозрачный (бывает) — вычитаем цвет углов: всё близкое к нему становится прозрачным
alpha = im.split()[-1]
if alpha.getextrema()[0] > 200:
    px = im.load()
    corners = [px[2, 2], px[W - 3, 2], px[2, H - 3], px[W - 3, H - 3]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))
    data = []
    for r, g, b, a in im.getdata():
        d = abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])
        data.append((r, g, b, 0 if d < 40 else min(255, a, int((d - 40) * 6)) if d < 82 else a))
    im.putdata(data)
# пыль вокруг рисунков
im.putalpha(im.split()[-1].point(lambda v: 0 if v < 24 else v))

cw, ch = W / 4, H / 4
for i, name in enumerate(NAMES):
    cx, cy = i % 4, i // 4
    cell = im.crop((round(cx * cw), round(cy * ch), round((cx + 1) * cw), round((cy + 1) * ch)))
    box = cell.split()[-1].getbbox()
    if not box:
        print('пусто:', name)
        continue
    art = cell.crop(box)
    side = int(max(art.size) * 1.12)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(art, ((side - art.width) // 2, (side - art.height) // 2), art)
    sq = sq.resize((SIZE, SIZE), Image.LANCZOS)
    sq.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=90, method=6)
    print(f'{name}: {art.size[0]}×{art.size[1]} → {SIZE}')
