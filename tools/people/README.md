# Люди: кисти, рукава, волосы (Blender)

Решение Эмиля 22.11: Claude Design собирает людей из простых фигур, пальцы и волосы так не выходят. Органику строим кодом в Blender, а скелет, клипы и имена узлов остаются из Claude Design.

## Что где

- `hand_build.py` — кисть по костям `fp_arms` (ладонь, 4 пальца по 3 фаланги, большой палец, ногти, цвет кожи вершинами), сглаживание subsurf 2.
- `sleeve_build.py` — рукава свитера: сужение к манжете, складки у локтя и над манжетой, манжета-резинка, своя бесшовная вязка (`knit_albedo.png`, `knit_normal.png`), цвет мальчика и девочки.
- `export_arms.py` — запекает кисти и рукава в `fp_hands`, `sleeves_boy`, `sleeves_girl` и выгружает их из Blender (без клипов).
- `splice.mjs` — вставляет эти сетки в исходный `assets/_raw/world/fp_arms.glb`: кости, клипы и узлы родные, координаты переводятся в его позу привязки, суставы сопоставляются по именам.
- `hair_build.py` (кудри мальчика), `bob_build.py` (каре девочки), `dump.py` — волосы по форме головы; `dump()` пишет JSON в локальных координатах узла `hair_mesh`.
- `splice_rigid.mjs` — заменяет сетку жёстко привязанного узла (волосы) из JSON или утолщает его (`neck_mesh=@scale:1.35`).
- `pack_arms.sh`, `pack_person.sh boy|girl ...` — вставка, затем webp и meshopt (как в `tools/world_pack.mjs`), затем копия в `assets/models/world/`.

Скрипты Blender запускаются через MCP for Blender (`exec(open(path).read())`); перед `hand_build.py` и `sleeve_build.py` в сцене должен быть импортирован исходный `fp_arms.glb` (арматура `root`). Промежуточные файлы лежат в `assets/_raw/people/` (не в git). gltf-transform 4.5.1 берётся из `../space-mission/node_modules` (путь в начале `splice*.mjs`).

Старые модели до замены: `assets/_raw/world_backup/`.
