#!/usr/bin/env python3
"""Своя музыка для трейлера «Дневник-книга» (без чужих песен): «музыкальная шкатулка» + тёплый пэд,
96 уд/мин, гармония C–G–Am–F, 2:10. Всё синтезируется кодом (numpy) → WAV 48 кГц стерео.
Запуск: python3 tools/trailer/music.py out.wav [длина_с]
Громкость потом нормализуется ffmpeg loudnorm до −16 LUFS (см. tools/trailer/build.sh)."""
import sys
import wave

import numpy as np

SR = 48000
OUT = sys.argv[1] if len(sys.argv) > 1 else 'music.wav'
LEN = float(sys.argv[2]) if len(sys.argv) > 2 else 130.0
BPM = 96
BEAT = 60 / BPM
BAR = BEAT * 4
N = int(LEN * SR)
L = np.zeros(N)
R = np.zeros(N)
rng = np.random.default_rng(7)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def add(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR)
    if i >= N:
        return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 - pan))
    R[i:i + len(sig)] += sig * np.sqrt(0.5 * (1 + pan))


def musicbox(m, dur=2.2):
    """Нота шкатулки: чистый тон + обертоны, мгновенная атака, долгое затухание, лёгкий «звон»."""
    t = np.arange(int(dur * SR)) / SR
    f = hz(m)
    env = np.exp(-t * 2.6) * (1 - np.exp(-t * 900))
    s = np.sin(2 * np.pi * f * t) + 0.42 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 4) + 0.18 * np.sin(2 * np.pi * 3.01 * f * t) * np.exp(-t * 7)
    s += 0.12 * np.sin(2 * np.pi * 4.2 * f * t) * np.exp(-t * 14)  # металлический «клик» язычка
    return s * env * 0.32


def pad(notes, dur):
    """Тёплый пэд: несколько слегка расстроенных синусов с обертонами, медленная атака и спад."""
    t = np.arange(int(dur * SR)) / SR
    env = np.minimum(1, t / 0.8) * np.minimum(1, (dur - t) / 0.9).clip(0)
    s = np.zeros_like(t)
    for m in notes:
        for d in (-0.06, 0.0, 0.07):
            f = hz(m) * 2 ** (d / 12)
            s += np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t) + 0.08 * np.sin(2 * np.pi * 3 * f * t)
    return s * env * 0.022


def bass(m, dur):
    t = np.arange(int(dur * SR)) / SR
    env = np.exp(-t * 1.6) * (1 - np.exp(-t * 300))
    f = hz(m)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t)) * env * 0.16


def kick():
    t = np.arange(int(0.35 * SR)) / SR
    f = 110 * np.exp(-t * 18) + 45
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 0.32


def brush(dur=0.12, g=0.05):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    x = np.diff(np.concatenate([[0], x]))  # «верхи» — шипящая щётка
    return x * np.exp(-t * 40) * g


# гармония по тактам: C, G, Am, F (MIDI-ноты аккорда, бас)
CHORDS = [([60, 64, 67], 36), ([59, 62, 67], 43), ([57, 60, 64], 45), ([57, 60, 65], 41)]
# мотив шкатулки на такт (доли, ступени поверх аккорда) — простой и запоминающийся
MOTIF = [(0, 2), (0.5, 1), (1, 0), (1.5, 1), (2, 2), (2.75, 3), (3, 2)]
ALT = [(0, 3), (0.5, 2), (1, 1), (2, 0), (2.5, 1), (3, 2), (3.5, 1)]

bars = int(LEN / BAR) + 1
for b in range(bars):
    t0 = b * BAR
    if t0 >= LEN - 0.5:
        break
    chord, root = CHORDS[b % 4]
    tones = sorted(set(chord + [c + 12 for c in chord]))
    sec = t0 / LEN
    # шкатулка: всю дорогу, в начале реже
    motif = MOTIF if (b // 4) % 2 == 0 else ALT
    for beat, deg in motif:
        if t0 < 8 and beat not in (0, 2):
            continue
        m = tones[min(deg + 2, len(tones) - 1)] + 12
        add(musicbox(m), t0 + beat * BEAT + rng.uniform(0, 0.012), pan=rng.uniform(-0.35, 0.35), gain=0.9 if beat == 0 else 0.7)
    # пэд с 6 с
    if t0 >= 6:
        add(pad([c - 12 for c in chord] + [chord[0]], BAR + 0.6), t0, pan=0, gain=1.0 if 30 < t0 < 118 else 0.7)
    # бас и мягкий ритм — когда начинается фильм (≈36 с) и до финала
    if 34 <= t0 < 120:
        add(bass(root, BEAT * 2), t0, gain=1.0)
        add(bass(root + 7 if b % 2 else root, BEAT * 2), t0 + BEAT * 2, gain=0.8)
        quiet = 72 <= t0 < 92  # «скучный день» — без бочки, только щётка
        for k in range(4):
            if not quiet and k in (0, 2):
                add(kick(), t0 + k * BEAT, gain=0.8)
            add(brush(g=0.035 if quiet else 0.05), t0 + k * BEAT + BEAT / 2, pan=0.3)
            if 92 <= t0 < 116:  # склейки на долях и «Поклон» — щётка чаще
                add(brush(0.08, 0.03), t0 + k * BEAT + BEAT * 0.25, pan=-0.3)
    # колокольчик-акцент на смене разделов
    if b in (3, 14, 29, 37, 46):
        add(musicbox(84, 3.0), t0, pan=0.2, gain=0.6)

# финальный аккорд шкатулки и затухание
end = min(LEN - 6, bars * BAR)
for i, m in enumerate([72, 76, 79, 84]):
    add(musicbox(m, 4.0), end + i * 0.12, pan=-0.2 + i * 0.13, gain=0.8)

mix = np.stack([L, R], axis=1)
# мягкая «комната»: короткое эхо
for d, g in ((0.11, 0.18), (0.23, 0.10), (0.37, 0.06)):
    k = int(d * SR)
    mix[k:] += mix[:-k][:, ::-1] * g
t = np.arange(N) / SR
fade = np.minimum(1, t / 1.5) * np.clip((LEN - t) / 4.0, 0, 1)
mix *= fade[:, None]
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89
pcm = (mix * 32767).astype('<i2')
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'{OUT}: {LEN:.1f} с, {BPM} уд/мин')
