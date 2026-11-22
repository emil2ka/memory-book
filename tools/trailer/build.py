#!/usr/bin/env python3
"""Монтаж трейлера «Дневник-книга» (≈2:08, 1920×1080, 24 к/с, H.264 + AAC) — только ffmpeg.
Источники (папка WORK, см. submission/trailer-plan.md):
  clips/<имя>/v_0000.png…  — кадры фильмов, снятые самой сценой (__dev.filmFrames)
  stills/still_hd_*.jpg      — стоп-кадры ввода с живого сайта 1920×1080
  subs/sub_NN.png, title.png — титры (tools/trailer/subs.py)
  music.wav                  — своя музыка (tools/trailer/music.py → loudnorm −16 LUFS)
Запуск: python3 tools/trailer/build.py WORK OUT.mp4"""
import json
import os
import subprocess
import sys

WORK = sys.argv[1]
OUT = sys.argv[2]
FPS = 24
X = 0.4  # длина перехода
SEG = os.path.join(WORK, 'seg')
os.makedirs(SEG, exist_ok=True)


def ff(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS)]

# Раскадровка: (имя, вид, источник, параметры). film: [(клип, от, до), …] — склейки внутри сегмента жёсткие (на долях).
SEGMENTS = json.load(open(os.path.join(WORK, 'segments.json')))


def film(name, parts):
    lst = os.path.join(SEG, f'{name}.txt')
    tmp = []
    for k, (clip, a, b) in enumerate(parts):
        p = os.path.join(SEG, f'{name}_{k}.mp4')
        start = round(a * FPS)
        n = round((b - a) * FPS)
        ff(['-framerate', str(FPS), '-start_number', str(start), '-i', os.path.join(WORK, 'clips', clip, 'v_%04d.png'), '-frames:v', str(n), *ENC, p])
        tmp.append(p)
    with open(lst, 'w') as fh:
        fh.writelines(f"file '{p}'\n" for p in tmp)
    out = os.path.join(SEG, f'{name}.mp4')
    ff(['-f', 'concat', '-safe', '0', '-i', lst, *ENC, out])
    return out


def still(name, img, dur, zoom=0.06):
    out = os.path.join(SEG, f'{name}.mp4')
    frames = round(dur * FPS)
    # медленный наезд: картинка вдвое больше кадра, zoompan без дрожи
    vf = (f"scale=3840:2160,zoompan=z='1+{zoom}*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
          f":d={frames}:s=1920x1080:fps={FPS}")
    ff(['-loop', '1', '-i', img, '-vf', vf, '-frames:v', str(frames), *ENC, out])
    return out


def dur_of(p):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p], capture_output=True, text=True)
    return float(r.stdout.strip())


files, durs = [], []
for s in SEGMENTS:
    if s['kind'] == 'film':
        p = film(s['name'], s['parts'])
    else:
        p = still(s['name'], os.path.join(WORK, s['img']), s['dur'], s.get('zoom', 0.06))
    files.append(p)
    durs.append(dur_of(p))
    print(f"{s['name']:>10}: {durs[-1]:.2f} с")

# начало каждого сегмента на итоговой шкале (переходы съедают по X)
starts, t = [], 0.0
for i, d in enumerate(durs):
    starts.append(t)
    t += d - (X if i < len(durs) - 1 else 0)
TOTAL = t
print(f'итого: {TOTAL:.2f} с')

# 1) склейка с переходами
inputs = []
for p in files:
    inputs += ['-i', p]
chain, last = [], '[0:v]'
acc = durs[0]
for i in range(1, len(files)):
    off = acc - X
    tr = SEGMENTS[i].get('tr', 'fade')
    chain.append(f'{last}[{i}:v]xfade=transition={tr}:duration={X}:offset={off:.3f}[x{i}]')
    last = f'[x{i}]'
    acc = off + durs[i]
base = os.path.join(WORK, 'base.mp4')
ff([*inputs, '-filter_complex', ';'.join(chain), '-map', last, *ENC, base])

# 2) титры поверх (картинки с плавным появлением 0.3 с) + музыка
subs = json.load(open(os.path.join(WORK, 'subs_at.json')))  # [[сегмент, сдвиг, длительность], …] по порядку sub_NN
args = ['-i', base, '-i', os.path.join(WORK, 'music.wav')]
fc, last = [], '[0:v]'
for k, (seg, off, d) in enumerate(subs):
    a = starts[seg] + off
    args += ['-loop', '1', '-t', f'{TOTAL:.3f}', '-i', os.path.join(WORK, 'subs', f'sub_{k:02d}.png')]
    j = k + 2
    fc.append(f'[{j}:v]format=rgba,fade=t=in:st={a:.2f}:d=0.3:alpha=1,fade=t=out:st={a + d - 0.3:.2f}:d=0.3:alpha=1[s{k}]')
    fc.append(f'{last}[s{k}]overlay=0:0:enable=\'between(t,{a:.2f},{a + d:.2f})\'[o{k}]')
    last = f'[o{k}]'
    print(f'титр {k:02d}: {a:6.2f}–{a + d:6.2f}')
fc.append(f'[1:a]atrim=0:{TOTAL:.3f},afade=t=in:st=0:d=1,afade=t=out:st={TOTAL - 3.5:.3f}:d=3.5[a]')
ff([*args, '-filter_complex', ';'.join(fc), '-map', last, '-map', '[a]', *ENC, '-c:a', 'aac', '-b:a', '192k', '-t', f'{TOTAL:.3f}', '-movflags', '+faststart', OUT])
print(f'готово: {OUT} ({os.path.getsize(OUT) / 1e6:.1f} МБ, {TOTAL:.1f} с)')
