# Трейлер «Дневник-книга»

План и раскадровка — `submission/trailer-plan.md`. Голоса нет, музыка своя, титры вшиты.

1. **Кадры фильмов.** `node tools/trailer/render.mjs '[["park",0,0,64],["bored",4,0,64],["aul",3,0,64]]' 1920`.
   Нужен dev-сервер без перезагрузок на :5194. Кадры снимает сама сцена (`__dev.filmFrames`), 24 к/с.
   Дни 4–5 («Лето в ауле», «Скучный день») добавляются в список по ходу.
2. **Стоп-кадры ввода** 1920×1080: живой сайт и локальный сервер (вход, «Кто ведёт дневник?», текст, фото, 3 песни ИИ, сургуч, «Почему так»).
3. **Музыка:** `python3 tools/trailer/music.py music_raw.wav 130`, затем `ffmpeg -i music_raw.wav -af loudnorm=I=-16:TP=-1.5 music.wav`.
4. **Титры:** `python3 tools/trailer/subs.py subs`. Шрифт Caveat (OFL, `Caveat-OFL.txt`). В этой сборке ffmpeg нет drawtext, поэтому титры — картинками.
5. **Монтаж:** `python3 tools/trailer/build.py WORK out.mp4`. В `WORK` лежат `clips/`, `stills/`, `subs/`, `music.wav`, `segments.json` и `subs_at.json` (копии — здесь).
