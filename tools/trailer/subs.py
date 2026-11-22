#!/usr/bin/env python3
"""Титры трейлера: прозрачные PNG 1920×1080 (Caveat Bold, белые с мягкой тенью, внизу по центру)
и финальный титр на тёмной бумаге. В этой сборке ffmpeg нет drawtext, поэтому титры — картинками,
ffmpeg накладывает их overlay с плавным появлением (tools/trailer/build.sh).
Запуск: python3 tools/trailer/subs.py <папка> — пишет sub_NN.png, title.png и subs.txt (начало, конец, файл)."""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else '.'
W, H = 1920, 1080
os.makedirs(OUT, exist_ok=True)


def font(size, bold=True):
    f = ImageFont.truetype(os.path.join(HERE, 'Caveat.ttf'), size)
    f.set_variation_by_name('Bold' if bold else 'Regular')
    return f


# (начало, конец, текст) — по раскадровке submission/trailer-plan.md
SUBS = [
    (0.6, 4.0, 'Фотография помнит, как день выглядел.'),
    (4.3, 7.8, 'Мы хотим вернуть, как он ощущался.'),
    (8.6, 13.4, 'Ты ведёшь дневник.'),
    (14.4, 18.9, 'Пара предложений о дне.'),
    (19.3, 23.8, 'Фото.'),
    (24.2, 29.6, 'Песня — ИИ подберёт её под этот день.'),
    (30.4, 35.6, 'Собрать день.'),
    (37.0, 42.5, 'ИИ пересказывает твой день.'),
    (46.0, 51.5, 'Человечек проживает его.'),
    (56.0, 62.0, 'Слова становятся сценками.'),
    (73.0, 78.0, 'Скучно? Он сыграет это сам.'),
    (81.0, 86.5, '33 эмоции и действия.'),
    (92.5, 100.5, 'Фильм идёт под песню: в такт,\nповорот дня — на припеве.'),
    (103.0, 109.5, 'В конце — все, кто был в этом дне.'),
    (114.5, 121.5, 'Каждый кадр — из твоих слов,\nснимков и песни.'),
]


def subtitle(text, path):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    f = font(76)
    lines = text.split('\n')
    lh = 84
    y0 = H - 90 - lh * len(lines)
    # мягкая тень: размытая тёмная копия
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ds = ImageDraw.Draw(sh)
    for i, line in enumerate(lines):
        ds.text((W / 2 + 2, y0 + i * lh + 4), line, font=f, fill=(12, 8, 5, 230), anchor='ma')
    sh = sh.filter(ImageFilter.GaussianBlur(7))
    im.alpha_composite(sh)
    im.alpha_composite(sh)  # тень плотнее под тонкими штрихами рукописи
    d = ImageDraw.Draw(im)
    for i, line in enumerate(lines):
        d.text((W / 2, y0 + i * lh), line, font=f, fill=(255, 251, 240, 255), anchor='ma', stroke_width=1, stroke_fill=(40, 28, 18, 160))
    im.save(path)


def title(path):
    paper = os.path.join(HERE, '..', '..', 'assets', 'ui', 'paper.webp')
    bg = Image.new('RGB', (W, H), (30, 21, 15))
    if os.path.exists(paper):
        tile = Image.open(paper).convert('RGB').resize((512, 512))
        tex = Image.new('RGB', (W, H))
        for x in range(0, W, 512):
            for y in range(0, H, 512):
                tex.paste(tile, (x, y))
        # тёмная бумага: фактура, умноженная на тёплый тёмно-коричневый
        tex = Image.eval(tex, lambda v: int(v * 0.16))
        bg = Image.blend(bg, tex, 0.6)
    # виньетка и тёплое пятно лампы сверху слева
    glow = Image.new('L', (W, H), 0)
    dg = ImageDraw.Draw(glow)
    dg.ellipse((-300, -500, 1300, 700), fill=70)
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    bg = Image.composite(Image.new('RGB', (W, H), (120, 80, 40)), bg, glow)
    d = ImageDraw.Draw(bg)
    d.text((W / 2, 380), 'Дневник-книга', font=font(190), fill=(243, 230, 200), anchor='mm')
    d.line((W / 2 - 260, 485, W / 2 + 260, 485), fill=(181, 67, 47), width=5)
    d.text((W / 2, 600), 'Пишешь о дне — книга превращает слова в маленький фильм', font=font(58, bold=False), fill=(233, 217, 180), anchor='mm')
    d.text((W / 2, 760), 'REC GENESIS · ArtTech 2026', font=font(60), fill=(201, 149, 61), anchor='mm')
    d.text((W / 2, 850), 'memory-book-mauve.vercel.app', font=font(64), fill=(243, 230, 200), anchor='mm')
    bg.save(path)


with open(os.path.join(OUT, 'subs.txt'), 'w') as fh:
    for i, (a, b, t) in enumerate(SUBS):
        p = os.path.join(OUT, f'sub_{i:02d}.png')
        subtitle(t, p)
        fh.write(f'{a} {b} {p}\n')
title(os.path.join(OUT, 'title.png'))
print(f'{len(SUBS)} титров + title.png → {OUT}')
