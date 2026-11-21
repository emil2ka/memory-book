# Промпты для спрайтов

Перед каждым промптом вставить блок «Для спрайтов» из [STYLE_PREAMBLE.md](STYLE_PREAMBLE.md). В промпты с человечком добавить блок «Описание человечка».

После генерации каждый лист проходит `tools/pixel_snap.py` (см. [03-art-pipeline](../03-art-pipeline.md)).

> **Человечки больше не генерируются (с 21 ноября).** Листы `hero_base`, `hero_actions`, `hero2_base` собирает риг `tools/make_hero.py` (ячейка 32×48, 6 кадров в ряду). Промпты S0–S3 ниже оставлены для истории; для предметов, эффектов и pop-up (S4–S6) генерация остаётся.

## S0 — эталонный кадр человечка

```text
One single sprite, centred, large on the canvas: the character standing still, facing 3/4 right, arms down. 24x32 pixel grid, shown at 16x scale. Nothing else in the image.
```

Этот кадр прикладывается картинкой ко всем следующим запросам с человечком со словами: `Use the attached sprite as the exact character reference.`

## S1 — базовые анимации (волна 0)

```text
Sprite sheet, 4 rows x 6 columns, each cell 24x32 pixels at 16x scale, even spacing, no text labels.
Row 1: idle, gentle breathing and a scarf sway.
Row 2: walk cycle to the right.
Row 3: pulling something heavy out of the ground with both hands, leaning back.
Row 4: sitting down on the ground, then sitting still.
The character stays the same size and stands on the same baseline in every cell.
```

## S2 — действия (волна 1)

```text
Sprite sheet, 5 rows x 6 columns, each cell 24x32 pixels at 16x scale, even spacing, no text labels.
Row 1: shaking an object held overhead.
Row 2: carrying a small object in front of the chest while walking right.
Row 3: drinking from a mug held in both hands.
Row 4: shivering from cold, hugging self, scarf pulled up.
Row 5: happy jump with arms up.
The character stays the same size and stands on the same baseline in every cell.
```

## S3 — второй человечек (волна 1)

```text
Sprite sheet, 3 rows x 6 columns, each cell 24x32 pixels at 16x scale. A second character with the same proportions as the reference but an ochre jacket, a soft green scarf and longer hair.
Row 1: idle. Row 2: walk cycle to the left. Row 3: sitting.
```

## S4 — предметы, набор 1 (волна 0)

```text
Item sheet, 4 rows x 4 columns, each cell 16x16 pixels at 16x scale, even spacing, no text labels, one item per cell, centred:
mug of cocoa with steam, coffee cup, yellow autumn leaf, snowflake,
water drop, sun, crescent moon, street lamp,
laptop, phone, closed book, slice of cake,
heart, music note, umbrella, park bench.
```

## S5 — предметы, набор 2 (волна 1)

```text
Item sheet, 4 rows x 4 columns, each cell 16x16 pixels at 16x scale, even spacing, no text labels, one item per cell, centred:
cup of tea, pizza slice, bicycle, bus,
car, ball, guitar, headphones,
gift box, candle, flower, dog,
cat, backpack, alarm clock, star.
```

## S6 — эффекты (волна 1)

```text
Effect sheet, 7 rows x 8 columns, each cell 16x16 pixels at 16x scale, even spacing, no text labels. Each row is one looping animation:
Row 1: a yellow leaf falling and turning.
Row 2: a snowflake drifting.
Row 3: a rain drop falling and splashing.
Row 4: steam rising and fading.
Row 5: frost crystals growing from one corner.
Row 6: sparkles popping.
Row 7: a small word-shaped block breaking apart into loose pixels.
```
