# Преамбула стиля

Вставляется первой строкой в каждый запрос генерации. Менять только здесь.

## Для 3D-моделей (Claude Design)

Мир реалистичный (решение от 21 ноября): модели без пиксельных текстур.

```text
STYLE RULE — MEMORY BOOK WORLD. A realistic, slightly stylised 3D prop for a cosy desk scene lit by one warm lamp, rendered at full resolution with soft shadows. Believable materials painted into smooth textures: worn leather, uncoated cream paper, brushed metal, matte plastic, oiled wood. Smooth texture filtering, NO pixel art, no hard pixel edges, no visible texels. One texture atlas up to 1024x1024 with subtle wear, grain and edge darkening; no baked directional shadows. Clean rounded bevels, modest polygon count (max 6000 triangles unless stated). Warm muted palette: cream, amber, ochre, brick red, soft green, slate blue, deep navy, dark brown. Y up, origin at the base, 1 unit = 10 cm. Export GLB with named animation clips exactly as listed.
```

## Для спрайтов (генератор картинок)

```text
STYLE RULE — MEMORY BOOK SPRITES. True pixel art on a strict pixel grid, every pixel a perfect square of the same size, no anti-aliasing, no blur, no gradients, no sub-pixels. Flat transparent or solid magenta (#FF00FF) background. Limited warm 32-colour palette: paper cream, amber, ochre, brick red, soft green, slate blue, deep navy, near-black brown. No black outline: shapes are separated by colour and a darker shade of the same hue. Light from the top-left. Cosy handmade look, like tiny paper figures living inside a diary.
```

## Описание человечка

Человечки собираются ригом `tools/make_hero.py`, а не генератором. Описание ниже — справка для предметов и сцен рядом с ним.

```text
CHARACTER: a tiny chibi person about 18 px wide and 36 px tall in a 32x48 cell: big round head with a tuft of dark-brown hair and a jagged fringe, 2x3 px dot eyes, pink cheeks, warm peach skin, slate-blue jacket, tan trousers, dark boots, a brick-red scarf with one end hanging down the front (it streams back when he walks). One-pixel near-black outline around the whole figure so he reads on cream paper. Same proportions, same colours and same scarf in every frame.
```
