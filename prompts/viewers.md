# Промпты для Claude Design (3D-модели)

Перед каждым промптом вставить блок «Для 3D-моделей» из [STYLE_PREAMBLE.md](STYLE_PREAMBLE.md). Один запрос за раз.

## Viewer A — книга (волна 0)

```text
Build a 3D viewer with one model: a hardcover diary book lying on a table.
Parts: front cover, back cover, spine, a block of pages on each side, and 3 separate loose page meshes that can turn.
Each loose page is a plane subdivided 12x1 along its width so it can bend while turning.
The front cover has a flat rectangular plate for a title and a ribbon bookmark.
Animation clips, named exactly:
- Open: closed book opens to a flat spread, 1.2 s
- Close: flat spread closes, 1.0 s
- Flip: one loose page turns from right to left with a bend, 0.8 s
- Idle: very subtle page breathing loop, 3 s
Max 6000 triangles. Paper pages are cream with faint ruled lines painted in the texture.
Add buttons in the viewer to play each clip, and a COPY button that exports the GLB.
```

## Viewer B — стол и свет (волна 0–1)

```text
Build a 3D viewer with these separate models, each exportable on its own:
1. Desk lamp with a round shade and a bent arm. Clip "Flicker": light intensity jitter loop, 2 s.
2. Cassette player with a transparent lid and a cassette. Clips "Insert": lid opens, cassette drops in, lid closes, 1.5 s; "Spin": reels rotate loop, 1 s.
3. Wooden desk top, plain plank surface, 160 x 80 cm.
4. Polaroid photo frame, flat, with a white border and a slightly curled corner. Clip "Stick": drops and settles with a tiny bounce, 0.5 s. The photo area must be a separate material so a texture can be swapped in code.
Add a COPY button per model that exports the GLB.
```

## Viewer C — pop-up природа (волна 1)

```text
Build a 3D viewer with pop-up book models. Each one looks cut from thick paper, 3 to 4 flat layers with small gaps between them, standing on a hinge at the base.
Models: 1. autumn tree, 2. park bench, 3. street lamp.
Every model has a clip "Fold": it lies flat on the page, then swings up 90 degrees on its base hinge with a small overshoot, 0.6 s.
Origin is on the hinge line. Add a COPY button per model.
```

## Viewer D — pop-up дом и город (волна 1)

```text
Same pop-up paper style and the same "Fold" clip as before.
Models: 1. small house front with one window that can glow (window is a separate emissive material), 2. work desk with a laptop and a mug, 3. cafe table with two chairs.
Add a COPY button per model.
```

## Viewer E — полка (волна 1)

```text
Build a 3D viewer with:
1. A wooden wall shelf, one board, 120 cm wide, modular so several can be stacked.
2. A closed book in three thicknesses (thin, medium, thick). The spine and the cover are a separate material so the colour can be set in code. The spine has a flat area for a text texture.
Clip "SlideOut" on the book: slides 12 cm forward out of the row and tilts slightly, 0.4 s.
Add a COPY button per model.
```
