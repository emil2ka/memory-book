# Преамбула стиля

Вставляется первой строкой в каждый запрос генерации. Менять только здесь.

## Для 3D-моделей (Claude Design)

```text
STYLE RULE — MEMORY BOOK. Low-poly "chunky" 3D model made to be rendered at 480x270 with nearest-neighbour upscaling, so it reads as pixel art. Big simple readable shapes, no small geometric detail: detail is painted in the texture. One texture atlas, max 256x256, hard pixel edges, no anti-aliasing, no gradients, no baked soft shadows. Colours only from a warm 32-colour palette: paper cream, amber, ochre, brick red, soft green, slate blue, deep navy, near-black brown. No black outlines. Slightly handmade, cosy, like a paper pop-up book on a wooden desk under a warm lamp. Y up, origin at the base, 1 unit = 10 cm. Max 3000 triangles unless stated. Export GLB with named animation clips exactly as listed.
```

## Для спрайтов (генератор картинок)

```text
STYLE RULE — MEMORY BOOK SPRITES. True pixel art on a strict pixel grid, every pixel a perfect square of the same size, no anti-aliasing, no blur, no gradients, no sub-pixels. Flat transparent or solid magenta (#FF00FF) background. Limited warm 32-colour palette: paper cream, amber, ochre, brick red, soft green, slate blue, deep navy, near-black brown. No black outline: shapes are separated by colour and a darker shade of the same hue. Light from the top-left. Cosy handmade look, like tiny paper figures living inside a diary.
```

## Описание человечка (вставлять во все листы с персонажем)

```text
CHARACTER: a tiny round-headed paper-like person, 24 px wide and 32 px tall, cream skin, short dark-brown hair, slate-blue jacket, a long brick-red scarf that is always visible, dot eyes, no mouth unless smiling. Same proportions, same colours and same scarf in every frame.
```
