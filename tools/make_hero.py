#!/usr/bin/env python3
"""make_hero — рисует листы человечков из одного рига.

Голова, куртка и шарф заданы пиксельными картами, руки и ноги рисуются по точкам,
поэтому в каждом кадре человечек один и тот же, а анимация плавная.

Запуск:  python3 tools/make_hero.py            -> assets/sprites/hero_base|hero_actions|hero2_base (.png + .json)
         python3 tools/make_hero.py --preview DIR   -> дополнительно увеличенные листы для просмотра
"""
from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

CW, CH = 32, 48  # ячейка
COLS = 6
GROUND = 46  # нижний ряд подошв


def rgb(h: str):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


INK = rgb("1b1410")

# ---------- палитры персонажей ----------
HERO = {
    "H": rgb("2a1a12"), "h": rgb("4a2d1b"), "l": rgb("7a4c2a"),  # волосы: тень, основа, блик
    "S": rgb("f6d9bb"), "s": rgb("e2ab86"),  # кожа, тень кожи
    "E": INK, "W": rgb("fbf6ea"), "B": rgb("e98f78"), "M": rgb("7a2e24"),
    "J": rgb("4a6285"), "j": rgb("7f97b3"), "d": rgb("2c3b58"),  # куртка
    "R": rgb("b5432f"), "r": rgb("e0745a"), "D": rgb("7a2e24"),  # шарф
    "P": rgb("b07a45"), "p": rgb("8a5a33"),  # штаны
    "K": rgb("3a2618"), "k": rgb("5c3b22"),  # ботинки
    "sep": rgb("18223a"),
}
SECOND = dict(HERO)
SECOND.update({
    "H": rgb("18223a"), "h": rgb("2c3b58"), "l": rgb("4a6285"),
    "J": rgb("c9953d"), "j": rgb("f4d675"), "d": rgb("8a5a33"),
    "R": rgb("55784a"), "r": rgb("8fa868"), "D": rgb("2f4a36"),
    "P": rgb("5c3b22"), "p": rgb("3a2618"),
    "K": rgb("7a2e24"), "k": rgb("b5432f"),
    "sep": rgb("3a2618"),
})

# ---------- пиксельные карты ----------
HEAD = [
    "......hhhhhhh.....",
    "....hhhhllhhhhh...",
    "...hhhllllhhhhhh..",
    "..hhhlllhhhhhhhhh.",
    ".hhhllhhhhhhhhhhhH",
    ".hhhlhhhhhhhhhhhhH",
    "hhhhhhhhhhhhhhhhhH",
    "hhhhhhhHhhhhhHhhHH",
    "HhhhHhHsHhhhHsHhHH",
    "HhhHsHsSsHhHsSsHHH",
    "HhHsSSSSSSHSSSSSH.",
    ".HHSSSSSSSSSSSSSS.",
    ".HHSSSSSSSSSSSSSS.",
    "..HsSSSSSSSSSSSSS.",
    "...sSSSSSSSSSSSSS.",
    "...ssSSSSSSSSSSS..",
    ".....sssSSSSSS....",
]
TUFT = ["..h", "hhl"]  # вихор на макушке, ставится над головой
TUFT_AT = (9, -2)
# у второго человечка волосы длиннее: каре до плеч
HEAD2 = [
    "......hhhhhhh.....",
    "....hhhhllhhhhh...",
    "...hhhllllhhhhhh..",
    "..hhhlllhhhhhhhhh.",
    ".hhhllhhhhhhhhhhhH",
    ".hhhlhhhhhhhhhhhhH",
    "hhhhhhhhhhhhhhhhhH",
    "hhhhhhhhhhhhhhhhHH",
    "hhhhhhHhhhhhhHhhHH",
    "HhhhHsSsHhhHsSsHHH",
    "HhhHSSSSSSSSSSSShH",
    "HhhHSSSSSSSSSSSShH",
    "HhhHSSSSSSSSSSSShH",
    "HhhHsSSSSSSSSSSShH",
    "HhhHsSSSSSSSSSSShH",
    "HhhhssSSSSSSSSSHhH",
    ".Hhh.sssSSSSSS.hH.",
    ".HhH...........hH.",
    "..HH............H.",
]
EYE_L, EYE_R = (6, 10), (12, 10)  # левый верхний угол глаза внутри головы
EYES = {
    "open": (["EE", "EE", "EE"], ["EE", "EE", "EE"]),
    "blink": (["..", "..", "EE"], ["..", "..", "EE"]),
    "closed": (["...", "E.E", ".E."], ["...", "E.E", ".E."]),
    "happy": (["...", ".E.", "E.E"], ["...", ".E.", "E.E"]),
    "strain": (["E..", ".E.", "E.."], ["..E", ".E.", "..E"]),
    "up": (["EE", "EE", ".."], ["EE", "EE", ".."]),
}
MOUTH_AT = (9, 14)
MOUTHS = {
    "none": [],
    "smile": ["M..M", ".MM."],
    "open": [".MM.", ".MM."],
    "small": [".MM."],
    "wave": ["M.M.", ".M.M"],
}

TORSO = [
    ".JJJJJJJJ.",
    "JJJJJjJJJd",
    "JJJJJjJJJd",
    "JJJJJjJJJd",
    "JJJJJjJJJd",
    "JJJJJjJJJd",
    "JJJJJjJJdd",
    "JJJJjjJddd",
    ".dddddddd.",
]
WRAP = [
    "..RRRRRRRR..",
    ".RrrrRRRRRR.",
    "RRRRRRRRRRDD",
    ".DDDRRRRDDD.",
]
BOOT = [
    "KkK..",
    "KKKKk",
    "KKKKK",
]
MUG = [
    "YcccY.",
    "YYYYYY",
    "YYYYyY",
    "YYYYY.",
    ".yyy..",
]
MUG_PAL = {"Y": rgb("e8b04a"), "y": rgb("c9953d"), "c": rgb("5c3b22"), "w": rgb("fbf6ea")}
SCRAP = [
    "wwwwwww",
    "wiwiiiw",
    "wwwwwww",
    "wiiwiww",
    "ccccccc",
]
SCRAP_PAL = {"w": rgb("fbf6ea"), "i": rgb("4a2d1b"), "c": rgb("cbb78d")}

# опорные точки стоящего человечка
HEAD_AT = (7, 12)
TORSO_AT = (11, 30)
WRAP_AT = (10, 28)
LSH, RSH = (10, 32), (21, 32)
LHAND0, RHAND0 = (9, 38), (22, 38)
LHIP, RHIP = (11, 39), (17, 39)  # левый верхний угол ноги шириной 4
TAIL_AT = (9, 30)


@dataclass
class Pose:
    by: int = 0  # тело вниз
    bx: int = 0  # тело вбок
    hx: int = 0  # голова относительно тела
    hy: int = 0
    jump: int = 0  # вся фигура вверх
    eyes: str = "open"
    mouth: str = "none"
    lhand: tuple | None = None  # абсолютные точки кисти (без учёта bx/by)
    rhand: tuple | None = None
    lelbow: tuple | None = None
    relbow: tuple | None = None
    lfoot: tuple = (0, 0)  # смещение стопы от стойки (dx, dy<0 — поднята)
    rfoot: tuple = (0, 0)
    sit: float = 0.0  # 0 стоит, 1 сидит: ноги вытянуты вперёд
    tail: tuple = (0.0, 0.0)  # (ветер 0..1, фаза)
    wrap_up: int = 0  # шарф натянут на подбородок
    larm: str | None = None  # слой руки: 'back' за телом, 'mid' за головой, 'front' поверх всего
    rarm: str | None = None
    prop: str | None = None  # 'mug' | 'scrap'
    prop_at: tuple | None = None
    extra: list = field(default_factory=list)  # [(x, y, цвет)]


class Canvas:
    def __init__(self):
        self.px = np.zeros((CH, CW, 4), dtype=np.uint8)

    def put(self, x, y, c):
        if 0 <= x < CW and 0 <= y < CH:
            self.px[y, x] = (*c, 255)

    def filled(self, x, y):
        return 0 <= x < CW and 0 <= y < CH and self.px[y, x, 3] > 0

    def layer(self, pts: dict, sep=None):
        """pts: {(x,y): цвет}. sep — цвет тонкой внутренней обводки там, где слой ложится на уже нарисованное."""
        if sep is not None:
            for (x, y) in pts:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    q = (x + dx, y + dy)
                    if q not in pts and self.filled(*q):
                        self.put(*q, sep)
        for (x, y), c in pts.items():
            self.put(x, y, c)

    def outline(self, c=INK):
        a = self.px[..., 3] > 0
        n = np.zeros_like(a)
        n[1:, :] |= a[:-1, :]
        n[:-1, :] |= a[1:, :]
        n[:, 1:] |= a[:, :-1]
        n[:, :-1] |= a[:, 1:]
        edge = n & ~a
        self.px[edge] = (*c, 255)


def stamp(rows, at, pal) -> dict:
    out = {}
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != "." and ch != " ":
                out[(at[0] + i, at[1] + j)] = pal[ch]
    return out


def line(a, b):
    """Целочисленные точки от a до b."""
    (x0, y0), (x1, y1) = a, b
    n = max(abs(x1 - x0), abs(y1 - y0))
    if n == 0:
        return [(x0, y0)]
    return [(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n)) for i in range(n + 1)]


def limb(points, w, base, shade) -> dict:
    """Толстая ломаная. Полоски кладутся поперёк главного направления, поэтому край ровный."""
    cells = set()
    for a, b in zip(points, points[1:]):
        vertical = abs(b[1] - a[1]) >= abs(b[0] - a[0])
        for (x, y) in line(a, b):
            for k in range(w):
                cells.add((x - w // 2 + k, y) if vertical else (x, y - w // 2 + k))
    out = {}
    for (x, y) in cells:
        lit = (x + 1, y) in cells and (x, y + 1) in cells
        out[(x, y)] = base if lit else shade
    return out


def hand(at, pal) -> dict:
    x, y = at
    out = {(x + i, y + j): pal["S"] for i in (-1, 0, 1) for j in (-1, 0, 1)}
    out[(x + 1, y + 1)] = pal["s"]
    return out


def tail(pal, origin, wind, phase, length=10) -> dict:
    """Конец шарфа: в покое висит спереди узкой лентой, на ветру вытягивается назад (влево) и идёт волной."""
    cells = {}
    ox_, oy_ = origin
    if wind < 0.5:
        x0 = ox_ + 3 - round(6 * wind)
        for i in range(length):
            t = i / (length - 1)
            x = x0 + round(math.sin(phase) * 1.3 * t * t - wind * 5 * t)
            for k in range(3):
                if i == length - 1 and k == 1:
                    continue  # бахрома
                cells[(x + k, oy_ + 1 + i)] = pal["D"] if k == 2 else (pal["r"] if k == 0 and i % 4 == 1 else pal["R"])
        return cells
    n = length + 1
    for i in range(n):
        t = i / (n - 1)
        x = ox_ + 1 - i
        y = oy_ + round(i * 0.45 * (1.4 - wind) + math.sin(phase - i * 0.8) * 1.4 * t)
        for k in range(3 if i < n - 1 else 2):
            cells[(x, y + k)] = pal["D"] if k == 2 else (pal["r"] if k == 0 and i % 4 == 1 else pal["R"])
    return cells


def draw(p: Pose, pal: dict, head_rows) -> np.ndarray:
    c = Canvas()
    ox, oy = p.bx, p.by - p.jump
    lift = -p.jump

    def T(pt):  # точка тела
        return (pt[0] + ox, pt[1] + oy)

    def arm(sh, hd, el, sep):
        pts_ = [T(sh)] + ([T(el)] if el else []) + [T(hd)]
        c.layer(limb(pts_, 3, pal["J"], pal["d"]), sep=sep)
        c.layer(hand(T(hd), pal), sep=sep)

    arms = [
        (p.larm or ("front" if p.lhand else "mid"), LSH, p.lhand or LHAND0, p.lelbow),
        (p.rarm or ("front" if p.rhand else "mid"), RSH, p.rhand or RHAND0, p.relbow),
    ]

    def arms_on(layer_name, sep):
        for name, sh, hd, el in arms:
            if name == layer_name:
                arm(sh, hd, el, sep)

    def legs_sitting():
        # сидит как плюшевая игрушка: ноги вперёд, видны подошвы
        y = GROUND + lift
        sole = [".KKK.", "KkkkK", "KkkkK", ".KKK."]
        for x_thigh, x_boot in ((10, 8), (18, 19)):
            pts = {(x_thigh + ox + i, y - 5 + j): (pal["p"] if j == 2 else pal["P"]) for i in range(4) for j in range(3)}
            c.layer(pts, sep=INK)
            c.layer(stamp(sole, (x_boot + ox, y - 3), pal), sep=INK)

    def legs_standing():
        for hip, foot, far in ((LHIP, p.lfoot, True), (RHIP, p.rfoot, False)):
            base, shade = (pal["p"], pal["p"]) if far else (pal["P"], pal["p"])
            fx = hip[0] + foot[0]
            fy = GROUND - 3 + foot[1] + lift
            top = (hip[0] + ox + 2, hip[1] + oy - 1)
            bottom = (fx + 2, fy)
            mid = (round((top[0] + bottom[0]) / 2 + p.sit * 3), round((top[1] + bottom[1]) / 2))
            c.layer(limb([top, mid, bottom], 4, base, shade))
            c.layer(stamp(BOOT, (fx, fy + 1), pal))

    arms_on("back", None)
    if p.sit < 1:
        legs_standing()
    c.layer(stamp(TORSO, T(TORSO_AT), pal))
    if p.sit >= 1:
        legs_sitting()
    arms_on("mid", pal["sep"])
    c.layer(tail(pal, T(TAIL_AT), p.tail[0], p.tail[1]), sep=pal["sep"])

    # --- голова ---
    hat = (HEAD_AT[0] + ox + p.hx, HEAD_AT[1] + oy + p.hy)
    c.layer(stamp(head_rows, hat, pal))
    c.layer(stamp(TUFT, (hat[0] + TUFT_AT[0], hat[1] + TUFT_AT[1]), pal))
    el_, er_ = EYES[p.eyes]
    c.layer(stamp(el_, (hat[0] + EYE_L[0], hat[1] + EYE_L[1]), pal))
    c.layer(stamp(er_, (hat[0] + EYE_R[0], hat[1] + EYE_R[1]), pal))
    for bx_ in (4, 5, 14, 15):  # румянец
        c.put(hat[0] + bx_, hat[1] + 13, pal["B"])
    c.layer(stamp(MOUTHS[p.mouth], (hat[0] + MOUTH_AT[0], hat[1] + MOUTH_AT[1]), pal))

    # --- шарф вокруг шеи ---
    c.layer(stamp(WRAP, (WRAP_AT[0] + ox, WRAP_AT[1] + oy - p.wrap_up), pal))
    if p.wrap_up:
        c.layer(stamp(["..RRRRRRRR.."], (WRAP_AT[0] + ox, WRAP_AT[1] + oy + 3 - p.wrap_up), pal))

    arms_on("front", pal["sep"])
    if p.prop and p.prop_at:
        rows, ppal = (MUG, MUG_PAL) if p.prop == "mug" else (SCRAP, SCRAP_PAL)
        c.layer(stamp(rows, T(p.prop_at), ppal), sep=INK)

    for (x, y, col) in p.extra:
        c.put(x + ox, y + oy, col)

    c.outline()
    return c.px


# ---------- анимации ----------
def idle():
    by = [0, 0, 1, 1, 1, 0]
    return [Pose(by=by[i], tail=(0.0, i * math.tau / 6)) for i in range(6)]


def walk_legs(i):
    # контакт, опора, перенос — и зеркально
    L = [(-3, 0), (-3, -1), (0, -3), (3, 0), (1, 0), (-1, 0)]
    R = [(3, 0), (1, 0), (-1, 0), (-3, 0), (-3, -1), (0, -3)]
    by = [0, 1, 0, 0, 1, 0]
    return L[i], R[i], by[i]


def walk():
    out = []
    lsw = [3, 1, -1, -3, -1, 1]  # левая рука идёт вместе с правой ногой
    for i in range(6):
        lf, rf, by = walk_legs(i)
        out.append(Pose(
            by=by, lfoot=lf, rfoot=rf, bx=1,
            lhand=(LHAND0[0] + lsw[i], LHAND0[1] - abs(lsw[i]) // 2 - (1 if lsw[i] > 0 else 0)) if lsw[i] > 0 else None,
            rhand=(RHAND0[0] - lsw[i], RHAND0[1] - abs(lsw[i]) // 2) if lsw[i] < 0 else None,
            tail=(1.0, i * math.tau / 6),
        ))
    return out


def pull():
    # тянет слово из страницы: наклон вперёд, хват, рывок назад
    seq = [
        dict(bx=2, by=3, hx=1, hy=1, hands=(26, 42), eyes="open"),
        dict(bx=2, by=4, hx=1, hy=1, hands=(26, 43), eyes="strain"),
        dict(bx=0, by=2, hands=(25, 39), eyes="strain", mouth="small"),
        dict(bx=-2, by=1, hx=-1, hands=(23, 35), eyes="strain", mouth="open"),
        dict(bx=-1, by=2, hands=(24, 38), eyes="strain", mouth="small"),
        dict(bx=1, by=3, hx=1, hands=(26, 41), eyes="open"),
    ]
    out = []
    for i, s in enumerate(seq):
        hx_, hy_ = s["hands"][0] - s["bx"], s["hands"][1] - s["by"]
        out.append(Pose(
            bx=s["bx"], by=s["by"], hx=s.get("hx", 0), hy=s.get("hy", 0), eyes=s["eyes"], mouth=s.get("mouth", "none"),
            lhand=(hx_ - 3, hy_ + 1), rhand=(hx_, hy_), larm="back",
            lfoot=(-1 - (1 if s["bx"] < 0 else 0), 0), rfoot=(2, 0),
            tail=(0.3 if s["bx"] < 0 else 0.0, i * 1.1),
        ))
    return out


def sit():
    lap = dict(lhand=(13, 37), rhand=(18, 37))
    return [
        Pose(tail=(0, 0)),
        Pose(by=2, sit=0.5, tail=(0, 1)),
        Pose(by=4, sit=0.9, tail=(0.1, 2), lhand=(8, 38), rhand=(23, 38), larm="mid", rarm="mid"),
        Pose(by=7, sit=1, tail=(0.05, 3), eyes="blink", **lap),
        Pose(by=8, sit=1, tail=(0, 4), eyes="happy", **lap),
        Pose(by=7, sit=1, tail=(0, 5), eyes="happy", mouth="small", **lap),
    ]


def shake():
    dx = [-2, 0, 2, 0, -2, 0]
    out = []
    for i in range(6):
        d = dx[i]
        out.append(Pose(
            bx=-d // 2, hy=1, eyes="up", mouth="small",
            lhand=(10 + d, 10), rhand=(21 + d, 10), lelbow=(5 + d // 2, 22), relbow=(26 + d // 2, 22),
            larm="mid", rarm="mid",
            prop="scrap", prop_at=(12 + d, 4 - (1 if d == 0 else 0)),
            tail=(0.0, i * 2.0),
        ))
    return out


def carry():
    out = []
    for i in range(6):
        lf, rf, by = walk_legs(i)
        out.append(Pose(
            by=by, bx=1, lfoot=lf, rfoot=rf,
            lhand=(19, 37), rhand=(26, 37), lelbow=(11, 37), relbow=(22, 38),
            prop="scrap", prop_at=(19, 31),
            tail=(1.0, i * math.tau / 6),
        ))
    return out


def drink():
    steam = rgb("fbf6ea")
    seq = [
        dict(mug=(15, 33), eyes="open"),
        dict(mug=(15, 30), eyes="open"),
        dict(mug=(15, 26), eyes="closed", hy=-1),
        dict(mug=(15, 25), eyes="closed", hy=-1),
        dict(mug=(15, 31), eyes="happy"),
        dict(mug=(15, 33), eyes="happy", mouth="smile", puff=True),
    ]
    out = []
    for i, s in enumerate(seq):
        mx, my = s["mug"]
        extra = []
        if i in (0, 1):
            extra = [(mx + 1 + i, my - 2, steam), (mx + 2 - i, my - 3, steam)]
        if s.get("puff"):
            extra = [(24, 25, steam), (25, 24, steam), (26, 23, steam)]
        out.append(Pose(
            eyes=s["eyes"], mouth=s.get("mouth", "none"), hy=s.get("hy", 0), by=1 if i == 4 else 0,
            lhand=(mx - 2, my + 2), rhand=(mx + 7, my + 2), lelbow=(9, my + 5), relbow=(23, my + 5),
            prop="mug", prop_at=(mx, my), extra=extra, tail=(0.0, i * 0.9),
        ))
    return out


def shiver():
    ice = rgb("bcd3e3")
    jit = [0, 1, 0, -1, 0, 1]
    out = []
    for i in range(6):
        k = i % 2
        extra = [(4, 24 + k * 2, ice), (27, 25 - k * 2, ice), (3, 32 - k, ice), (28, 33 + k, ice)]
        out.append(Pose(
            bx=jit[i], by=2, eyes="strain", wrap_up=1, hy=1,
            lhand=(19, 35), rhand=(13, 37), lelbow=(9, 38), relbow=(22, 39),
            extra=[(x - jit[i], y - 2, col) for (x, y, col) in extra],
            tail=(0.0, i * 2.4),
        ))
    return out


def cheer():
    up = dict(larm="mid", rarm="mid")
    return [
        Pose(by=3, sit=0.4, eyes="happy", lhand=(8, 38), rhand=(23, 38), tail=(0, 0), **up),
        Pose(jump=3, eyes="happy", mouth="open", lhand=(5, 22), rhand=(26, 22), lelbow=(6, 29), relbow=(25, 29), tail=(0.2, 1), **up),
        Pose(jump=7, eyes="happy", mouth="open", lhand=(5, 13), rhand=(26, 13), lelbow=(5, 25), relbow=(26, 25), lfoot=(-2, -2), rfoot=(2, -2), tail=(0.5, 2), **up),
        Pose(jump=8, eyes="happy", mouth="open", lhand=(4, 15), rhand=(27, 15), lelbow=(5, 26), relbow=(26, 26), lfoot=(-2, -1), rfoot=(2, -1), tail=(0.3, 3), **up),
        Pose(jump=4, eyes="happy", mouth="smile", lhand=(5, 21), rhand=(26, 21), lelbow=(6, 28), relbow=(25, 28), tail=(0.1, 4), **up),
        Pose(by=2, sit=0.3, eyes="happy", mouth="smile", lhand=(8, 38), rhand=(23, 38), tail=(0, 5), **up),
    ]


ROWS = {
    "idle": idle, "walk": walk, "pull": pull, "sit": sit,
    "shake": shake, "carry": carry, "drink": drink, "shiver": shiver, "cheer": cheer,
}


def sheet(names, pal, head_rows):
    img = np.zeros((CH * len(names), CW * COLS, 4), dtype=np.uint8)
    frames = []
    for r, name in enumerate(names):
        for col, pose in enumerate(ROWS[name]()):
            img[r * CH:(r + 1) * CH, col * CW:(col + 1) * CW] = draw(pose, pal, head_rows)
            frames.append({"name": f"{name}_{col}", "col": col, "row": r})
    meta = {"cell": [CW, CH], "cols": COLS, "rows": len(names), "frames": frames}
    return Image.fromarray(img, "RGBA"), meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "assets" / "sprites"))
    ap.add_argument("--preview")
    a = ap.parse_args()
    out = Path(a.out)
    jobs = [
        ("hero_base", ["idle", "walk", "pull", "sit"], HERO, HEAD),
        ("hero_actions", ["shake", "carry", "drink", "shiver", "cheer"], HERO, HEAD),
        ("hero2_base", list(ROWS), SECOND, HEAD2),
    ]
    for name, rows, pal, head_rows in jobs:
        img, meta = sheet(rows, pal, head_rows)
        img.save(out / f"{name}.png")
        (out / f"{name}.json").write_text(json.dumps(meta, indent=2) + "\n")
        if a.preview:
            k = 6
            bg = Image.new("RGBA", img.size, (233, 217, 180, 255))
            bg.alpha_composite(img)
            bg.resize((img.width * k, img.height * k), Image.NEAREST).save(Path(a.preview) / f"{name}_x{k}.png")
    ref, _ = sheet(["idle"], HERO, HEAD)
    ref.crop((0, 0, CW, CH)).save(out / "hero_ref.png")


if __name__ == "__main__":
    main()
