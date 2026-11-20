#!/usr/bin/env python3
"""fade_fill — fill empty frames of a fading effect row by dithering out a source frame.

  fade_fill.py sheet.png --cell 16x16 --row 3 --src 4 --dst 5,6,7 [--rise 1]

Frame dst[k] = source frame moved up by rise*(k+1) px, with an ordered 4x4 Bayer
dither keeping (1 - (k+1)/(n+1)) of its pixels — the style bible's dither instead of
alpha. Writes the sheet in place.
"""
import argparse

import numpy as np
from PIL import Image

BAYER4 = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("--cell", required=True)
    ap.add_argument("--row", type=int, required=True)
    ap.add_argument("--src", type=int, required=True)
    ap.add_argument("--dst", required=True)
    ap.add_argument("--rise", type=int, default=1)
    a = ap.parse_args()
    W, H = (int(v) for v in a.cell.split("x"))
    im = np.array(Image.open(a.sheet).convert("RGBA"))
    y0 = a.row * H
    src = im[y0:y0 + H, a.src * W:(a.src + 1) * W].copy()
    dst = [int(v) for v in a.dst.split(",")]
    n = len(dst)
    yy, xx = np.mgrid[0:H, 0:W]
    for k, c in enumerate(dst):
        keep = 1 - (k + 1) / (n + 1)
        shift = a.rise * (k + 1)
        f = np.zeros_like(src)
        f[:H - shift] = src[shift:]
        mask = BAYER4[yy % 4, xx % 4] < keep
        f[~mask] = 0
        im[y0:y0 + H, c * W:(c + 1) * W] = f
    Image.fromarray(im, "RGBA").save(a.sheet)
    print(f"filled row {a.row} frames {dst} from frame {a.src}")


if __name__ == "__main__":
    main()
