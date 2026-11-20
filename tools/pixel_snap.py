#!/usr/bin/env python3
"""pixel_snap — turn an AI-generated, upscaled "pixel art" sheet into a real pixel sheet.

Steps:
  1. background -> transparent (magenta key, corner-colour auto, or real alpha);
  2. find the upscaled pixel grid (step + phase on X and Y, float step allowed);
  3. downsample: one art pixel = one image pixel, colour = majority vote of the
     palette-quantized source pixels in the inner part of each grid cell;
  4. split the art into cols x rows frames (by empty gaps, or evenly);
  5. place every frame into an exact W x H cell (anchor bottom-centre or centre),
     write the sheet PNG and a frames JSON.

Usage:
  pixel_snap.py in.png --cell 24x32 --cols 6 --rows 4 --out sheet.png \
      [--json frames.json] [--bg magenta|auto|alpha] [--report]
      [--names a,b,c | --row-names idle,walk] [--anchor bottom|center]
      [--step S | --step SXxSY] [--despeckle N]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Master palette — copied read-only from src/scene/palette.ts (32 colours, same order).
PALETTE_HEX = {
    "ink": "1b1410", "brownDark": "3a2618", "brown": "5c3b22", "wood": "8a5a33",
    "woodLight": "b07a45", "ochre": "c9953d", "amber": "e8b04a", "yellow": "f4d675",
    "cream": "f3e6c8", "paper": "e9d9b4", "paperShade": "cbb78d", "white": "fbf6ea",
    "brickDark": "7a2e24", "brick": "b5432f", "coral": "e0745a", "peach": "f2a983",
    "greenDark": "2f4a36", "green": "55784a", "greenSoft": "8fa868", "mint": "c3d39a",
    "tealDark": "1f4a50", "teal": "3b8483", "navy": "18223a", "slateDark": "2c3b58",
    "slate": "4a6285", "greyBlue": "7f97b3", "ice": "bcd3e3", "frost": "e3f0f5",
    "plum": "4a2a45", "mauve": "8a5a7c", "grey": "8c8478", "greyLight": "bfb7a6",
}
PAL = np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in PALETTE_HEX.values()], dtype=np.int32)
BG = len(PAL)  # index used for "background / transparent"


def nearest_palette(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """rgb: (N,3) int -> (index (N,), distance (N,)) using the 'redmean' weighted RGB distance."""
    rgb = rgb.astype(np.int32)
    best_i = np.zeros(len(rgb), dtype=np.int32)
    best_d = np.full(len(rgb), np.inf)
    for i, p in enumerate(PAL):
        rm = (rgb[:, 0] + p[0]) / 2.0
        dr, dg, db = (rgb - p).T
        d = np.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db)
        m = d < best_d
        best_d[m] = d[m]
        best_i[m] = i
    return best_i, best_d


def background_mask(rgba: np.ndarray, mode: str) -> np.ndarray:
    rgb = rgba[..., :3].astype(np.int32)
    alpha = rgba[..., 3]
    mask = alpha < 128
    if mode == "alpha":
        return mask
    if mode == "magenta":
        r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
        # pure-ish magenta, tolerant to JPEG noise / blur halos
        mag = (r > 150) & (b > 150) & (g < 110) & (np.abs(r - b) < 80)
        # blur halo: content colour mixed with magenta -> purple-ish (r and b well above g).
        # Palette mauve/plum stay below these margins.
        halo = (r - g > 60) & (b - g > 60)
        return mask | mag | halo
    # auto: dominant colour of the border ring
    h, w = alpha.shape
    ring = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    q = (ring // 8)
    keys, counts = np.unique(q[:, 0] * 1024 + q[:, 1] * 32 + q[:, 2], return_counts=True)
    k = keys[counts.argmax()]
    sel = (q[:, 0] * 1024 + q[:, 1] * 32 + q[:, 2]) == k
    bgc = np.median(ring[sel], axis=0)
    dist = np.sqrt(((rgb - bgc) ** 2).sum(-1))
    if mode == "auto-global":  # also punch enclosed holes (gaps between legs, under arms)
        return mask | (dist < 40)
    return mask | flood_from_border(dist < 40)


def flood_from_border(cand: np.ndarray) -> np.ndarray:
    """Keep only the candidate-background pixels connected to the image border, so a
    cream mug or white snowflake inside an item is not punched out."""
    from PIL import ImageDraw
    im = Image.fromarray(np.where(cand, 255, 0).astype(np.uint8), "L").copy()  # copy: fromarray may share a read-only buffer
    h, w = cand.shape
    px = im.load()
    border = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + \
             [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    for xy in border:
        if px[xy] == 255:
            ImageDraw.floodfill(im, xy, 128)
    return np.asarray(im) == 128


def edge_profile(rgb: np.ndarray, fg: np.ndarray, axis: int) -> np.ndarray:
    """Count strong colour changes between neighbouring columns (axis=1) or rows (axis=0)."""
    d = np.abs(np.diff(rgb.astype(np.int32), axis=axis)).sum(-1)
    f = fg[:, 1:] | fg[:, :-1] if axis == 1 else fg[1:, :] | fg[:-1, :]
    strong = (d > 40) & f
    prof = strong.sum(axis=0 if axis == 1 else 1).astype(np.float64)
    # an edge between pixel i and i+1 sits at coordinate i+1
    return np.concatenate([[0.0], prof])


def detect_step(prof: np.ndarray, smin: float = 3.0, smax: float = 64.0) -> tuple[float, float, float]:
    """Return (step, phase, confidence). Edges of an upscaled grid sit at phase + k*step.
    Fourier magnitude at 1/s peaks at the true step and its sub-harmonics s/2, s/3...,
    but NOT at 2s, so we take the largest step whose score is close to the best."""
    x = np.arange(len(prof), dtype=np.float64)
    tot = prof.sum()
    if tot <= 0:
        return 1.0, 0.0, 0.0
    smax = min(smax, len(prof) / 4)
    steps = np.arange(smin, smax, 0.01)
    scores = np.empty(len(steps))
    phases = np.empty(len(steps))
    for i, s in enumerate(steps):
        z = (prof * np.exp(2j * np.pi * x / s)).sum() / tot
        scores[i] = abs(z)
        phases[i] = (np.angle(z) / (2 * np.pi) * s) % s
    # Blur damps high frequencies, so the true step beats its sub-harmonics (s/2, s/3);
    # 2s scores ~0 (alternating signs). So a plain argmax is the robust choice.
    i = int(scores.argmax())
    return float(steps[i]), float(phases[i]), float(scores[i])


def grid_windows(prof: np.ndarray | None, step: float, phase: float, axis_len: int,
                 adaptive: bool = True) -> list[tuple[int, int]]:
    """Inner sampling window [a,b) for each art pixel along one axis.
    Adaptive: generators drift (cells of 49, 53, 51 px...), so each next boundary snaps to
    the strongest real edge within +-35% of the expected position; else the ideal grid."""
    peaks = None
    if adaptive and prof is not None and prof.max() > 0:
        sm = np.convolve(prof, np.ones(3) / 3, mode="same")
        thr = 0.12 * sm.max()
        peaks = np.flatnonzero((sm >= np.roll(sm, 1)) & (sm >= np.roll(sm, -1)) & (sm > thr))
    b = phase - step * np.ceil(phase / step)  # first boundary <= 0
    bounds = [b]
    while bounds[-1] < axis_len:
        e = bounds[-1] + step
        nb = e
        if peaks is not None and len(peaks):
            lo, hi = np.searchsorted(peaks, [e - 0.35 * step, e + 0.35 * step])
            cand = peaks[lo:hi]
            if len(cand):
                nb = float(cand[np.argmax(sm[cand] - 0.5 * sm.max() * np.abs(cand - e) / step)])
        bounds.append(nb)
    out = []
    for lo, hi in zip(bounds[:-1], bounds[1:]):
        w = hi - lo
        a, c = int(round(lo + w * 0.25)), int(round(hi - w * 0.25))
        a, c = max(a, 0), min(c, axis_len)
        if c <= a:
            m = int(np.clip(round((lo + hi) / 2), 0, axis_len - 1))
            a, c = m, m + 1
        out.append((a, c))
    return out


def downsample(idx: np.ndarray, xs, ys) -> np.ndarray:
    art = np.full((len(ys), len(xs)), BG, dtype=np.int32)
    for j, (y0, y1) in enumerate(ys):
        band = idx[y0:y1]
        for i, (x0, x1) in enumerate(xs):
            cell = band[:, x0:x1].ravel()
            cnt = np.bincount(cell, minlength=BG + 1)
            # background wins only with a real majority
            if cnt[BG] * 2 > cell.size:
                continue
            cnt[BG] = 0
            art[j, i] = cnt.argmax()
    return art


def median_colours(rgb: np.ndarray, bgm: np.ndarray, xs, ys) -> np.ndarray:
    """Per-art-pixel median colour (no quantization) — only for the off-palette report."""
    cols = []
    for (y0, y1) in ys:
        for (x0, x1) in xs:
            m = ~bgm[y0:y1, x0:x1]
            if m.sum() * 2 <= m.size:
                continue
            cols.append(np.median(rgb[y0:y1, x0:x1][m], axis=0))
    return np.array(cols, dtype=np.int32).reshape(-1, 3)


def despeckle(art: np.ndarray, min_size: int) -> np.ndarray:
    """Drop connected foreground blobs smaller than min_size (4-connectivity)."""
    if min_size <= 1:
        return art
    fg = art != BG
    seen = np.zeros_like(fg)
    h, w = fg.shape
    out = art.copy()
    for y in range(h):
        for x in range(w):
            if fg[y, x] and not seen[y, x]:
                stack = [(y, x)]
                seen[y, x] = True
                comp = []
                while stack:
                    cy, cx = stack.pop()
                    comp.append((cy, cx))
                    for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                        if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not seen[ny, nx]:
                            seen[ny, nx] = True
                            stack.append((ny, nx))
                if len(comp) < min_size:
                    for cy, cx in comp:
                        out[cy, cx] = BG
    return out


def clean_frame(art: np.ndarray, keep_frac: float = 0.06, rare: int = 2) -> np.ndarray:
    """1) drop blobs smaller than keep_frac of the biggest blob (bits of neighbour frames);
    2) a colour used <= `rare` times in the frame is generator noise: repaint those pixels
       with the most common colour among their 8 neighbours."""
    out = art.copy()
    fg = out != BG
    if not fg.any():
        return out
    h, w = fg.shape
    lab = np.zeros((h, w), dtype=np.int32)
    sizes = [0]
    for y in range(h):
        for x in range(w):
            if fg[y, x] and not lab[y, x]:
                n = len(sizes)
                stack = [(y, x)]
                lab[y, x] = n
                cnt = 0
                while stack:
                    cy, cx = stack.pop()
                    cnt += 1
                    for ny in (cy - 1, cy, cy + 1):
                        for nx in (cx - 1, cx, cx + 1):
                            if 0 <= ny < h and 0 <= nx < w and fg[ny, nx] and not lab[ny, nx]:
                                lab[ny, nx] = n
                                stack.append((ny, nx))
                sizes.append(cnt)
    big = max(sizes)
    for n, sz in enumerate(sizes[1:], start=1):
        if sz < keep_frac * big:
            out[lab == n] = BG
    vals, counts = np.unique(out[out != BG], return_counts=True)
    for v, c in zip(vals, counts):
        if c > rare:
            continue
        for y, x in zip(*np.nonzero(out == v)):
            nb = out[max(0, y - 1):y + 2, max(0, x - 1):x + 2].ravel()
            nb = nb[(nb != BG) & (nb != v)]
            if len(nb):
                out[y, x] = np.bincount(nb).argmax()
    return out


def bands(occ: np.ndarray, n: int) -> list[tuple[int, int]]:
    """Split a 1-D occupancy profile into n bands. Use empty gaps when there are exactly
    n runs of content; otherwise merge the closest runs / fall back to an even split."""
    idxs = np.flatnonzero(occ)
    if len(idxs) == 0:
        return [(0, 0)] * n
    lo, hi = idxs[0], idxs[-1] + 1
    runs = []
    start = None
    for i in range(lo, hi + 1):
        on = i < hi and occ[i]
        if on and start is None:
            start = i
        elif not on and start is not None:
            runs.append([start, i])
            start = None
    # merge runs separated by the smallest gaps until we have n (handles a scarf tip
    # or a steam puff detached from its sprite)
    while len(runs) > n:
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        g = int(np.argmin(gaps))
        runs[g] = [runs[g][0], runs[g + 1][1]]
        del runs[g + 1]
    if len(runs) == n:
        # cut in the middle of each gap so every band owns its full slot
        cuts = [lo] + [(runs[i][1] + runs[i + 1][0]) // 2 for i in range(n - 1)] + [hi]
        return [(cuts[i], cuts[i + 1]) for i in range(n)]
    edges = np.linspace(lo, hi, n + 1).round().astype(int)
    return [(edges[i], edges[i + 1]) for i in range(n)]


def place(frame: np.ndarray, W: int, H: int, anchor: str, lift: int = 0,
          offset: tuple[float, float] | None = None) -> tuple[np.ndarray, dict]:
    """Crop frame to its content and paste into a W x H cell."""
    fg = frame != BG
    info = {"empty": not fg.any(), "scaled": False}
    cell = np.full((H, W), BG, dtype=np.int32)
    if info["empty"]:
        return cell, info
    ys, xs = np.nonzero(fg)
    crop = frame[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    ch, cw = crop.shape
    info["src_size"] = [int(cw), int(ch)]
    # horizontal anchor: mass centroid (steadier than the bbox for walk cycles)
    cfg = crop != BG
    cx = float(np.nonzero(cfg)[1].mean())
    if cw > W or ch > H:
        k = min(W / cw, H / ch)
        nw, nh = max(1, int(cw * k)), max(1, int(ch * k))
        yi = (np.arange(nh) / k).astype(int).clip(0, ch - 1)
        xi = (np.arange(nw) / k).astype(int).clip(0, cw - 1)
        crop = crop[yi][:, xi]
        cx *= k
        ch, cw = crop.shape
        info["scaled"] = True
    ox = int(round(W / 2 - cx - 0.5))
    if anchor == "keep" and offset is not None:
        # keep: the bbox centre keeps its offset (art px) from the centre of its source cell
        ox = int(round(W / 2 + offset[0] - cw / 2))
    ox = int(np.clip(ox, 0, W - cw))
    oy = H - ch if anchor in ("bottom", "row-bottom") else (H - ch) // 2
    if anchor == "keep" and offset is not None:
        oy = int(np.clip(round(H / 2 + offset[1] - ch / 2), 0, H - ch))
    oy = max(0, oy - lift)  # row-bottom: a jump keeps its height above the row's ground line
    cell[oy:oy + ch, ox:ox + cw] = crop
    info["bbox"] = [ox, oy, cw, ch]  # x, y, w, h inside the cell
    return cell, info


def resample_frame(idx: np.ndarray, W: int, H: int, margin: int, anchor: str) -> tuple[np.ndarray, dict]:
    """No-grid fallback: crop full-res palette indices to content and fit into W x H.
    Each target pixel = majority palette index of its source block (bg needs > 50%)."""
    fg = idx != BG
    cell = np.full((H, W), BG, dtype=np.int32)
    info = {"empty": not fg.any(), "scaled": False}
    if info["empty"]:
        return cell, info
    ys, xs = np.nonzero(fg)
    crop = idx[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    ch, cw = crop.shape
    k = max(cw / (W - 2 * margin), ch / (H - 2 * margin))
    tw, th = max(1, min(W, round(cw / k))), max(1, min(H, round(ch / k)))
    xe = np.linspace(0, cw, tw + 1).round().astype(int)
    ye = np.linspace(0, ch, th + 1).round().astype(int)
    out = np.full((th, tw), BG, dtype=np.int32)
    for j in range(th):
        for i in range(tw):
            blk = crop[ye[j]:ye[j + 1], xe[i]:xe[i + 1]].ravel()
            cnt = np.bincount(blk, minlength=BG + 1)
            if cnt[BG] * 2 > blk.size:
                continue
            cnt[BG] = 0
            out[j, i] = cnt.argmax()
    info["src_size"] = [int(cw), int(ch)]
    info["resampled_from"] = [int(cw), int(ch)]
    placed, pinfo = place(out, W, H, anchor)
    info.update({k2: v for k2, v in pinfo.items() if k2 in ("bbox",)})
    return placed, info


def to_rgba(art: np.ndarray) -> np.ndarray:
    out = np.zeros(art.shape + (4,), dtype=np.uint8)
    fg = art != BG
    out[fg, :3] = PAL[art[fg]]
    out[fg, 3] = 255
    return out


def parse_step(s: str | None):
    if not s:
        return None
    if "x" in s:
        a, b = s.lower().split("x")
        return float(a), float(b)
    return float(s), float(s)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input")
    ap.add_argument("--cell", required=True, help="WxH of one frame in art pixels, e.g. 24x32")
    ap.add_argument("--cols", type=int, required=True)
    ap.add_argument("--rows", type=int, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--json")
    ap.add_argument("--bg", choices=["magenta", "auto", "auto-global", "alpha"], default="magenta")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--names", help="comma-separated frame names in cell order (row-major)")
    ap.add_argument("--row-names", help="comma-separated row names; frames become <row>_<i>")
    ap.add_argument("--anchor", choices=["bottom", "row-bottom", "center", "keep"], default="bottom")
    ap.add_argument("--step", help="force grid step, e.g. 16 or 15.8x16.1")
    ap.add_argument("--despeckle", type=int, default=3, help="drop blobs smaller than N px (0=off)")
    ap.add_argument("--art-out", help="also save the full downsampled art (debug)")
    ap.add_argument("--mode", choices=["grid", "frames", "resample", "auto"], default="auto",
                    help="grid: snap to the detected pixel grid; resample: no grid, block-majority fit "
                         "of each frame into the cell; frames: own grid per frame; auto: grid -> frames -> resample")
    ap.add_argument("--clean", action="store_true", help="drop stray blobs + repaint 1-2 px noise colours per frame")
    ap.add_argument("--fixed-grid", action="store_true", help="do not snap boundaries to real edges")
    ap.add_argument("--margin", type=int, default=0, help="resample: empty border inside the cell")
    a = ap.parse_args(argv)

    W, H = (int(v) for v in a.cell.lower().split("x"))
    img = Image.open(a.input).convert("RGBA")
    rgba = np.asarray(img)
    rgb = rgba[..., :3].astype(np.int32)
    bgm = background_mask(rgba, a.bg)
    fg = ~bgm

    forced = parse_step(a.step)
    if forced:
        sx, sy = forced
        _, px, cx_ = detect_step_fixed(edge_profile(rgb, fg, 1), sx)
        _, py, cy_ = detect_step_fixed(edge_profile(rgb, fg, 0), sy)
    else:
        # square pixels: one step that maximises the comb score on both axes together
        pxp, pyp = edge_profile(rgb, fg, 1), edge_profile(rgb, fg, 0)
        cand = np.arange(3.0, min(64.0, len(pxp) / 4, len(pyp) / 4), 0.01)
        tot = [detect_step_fixed(pxp, v)[2] + detect_step_fixed(pyp, v)[2] for v in cand]
        st = float(cand[int(np.argmax(tot))])
        sx, px, cx_ = detect_step_fixed(pxp, st)
        sy, py, cy_ = detect_step_fixed(pyp, st)

    flat_i, flat_d = nearest_palette(rgb.reshape(-1, 3))
    idx = flat_i.reshape(bgm.shape)
    idx[bgm] = BG
    prof_x, prof_y = edge_profile(rgb, fg, 1), edge_profile(rgb, fg, 0)
    xs = grid_windows(prof_x, sx, px, idx.shape[1], not a.fixed_grid)
    ys = grid_windows(prof_y, sy, py, idx.shape[0], not a.fixed_grid)
    art = downsample(idx, xs, ys)
    art = despeckle(art, a.despeckle)

    occ_x = (art != BG).any(axis=0)
    occ_y = (art != BG).any(axis=1)
    xb = bands(occ_x, a.cols)
    yb = bands(occ_y, a.rows)

    def grid_pass():
        sh = np.full((a.rows * H, a.cols * W), BG, dtype=np.int32)
        inf = []
        for r, (y0, y1) in enumerate(yb):
            for c, (x0, x1) in enumerate(xb):
                cell, info = place(art[y0:y1, x0:x1], W, H, a.anchor)
                sh[r * H:(r + 1) * H, c * W:(c + 1) * W] = cell
                info.update(col=c, row=r)
                inf.append(info)
        return sh, inf

    def frames_pass():
        """Per-frame grid: generators often draw every frame on its own slightly shifted
        grid. Find each frame's own step + phase (around the sheet-wide median step)."""
        fgi = idx != BG
        fxb = bands(fgi.sum(0) > max(2, 0.003 * fgi.shape[0]), a.cols)
        fyb = bands(fgi.sum(1) > max(2, 0.003 * fgi.shape[1]), a.rows)
        regs = [(r, c, y0, y1, x0, x1) for r, (y0, y1) in enumerate(fyb) for c, (x0, x1) in enumerate(fxb)]
        profs = {}
        steps = []
        for (r, c, y0, y1, x0, x1) in regs:
            sub_rgb, sub_fg = rgb[y0:y1, x0:x1], fg[y0:y1, x0:x1]
            px_, py_ = edge_profile(sub_rgb, sub_fg, 1), edge_profile(sub_rgb, sub_fg, 0)
            profs[(r, c)] = (px_, py_)
            if forced:
                continue
            if px_.sum() > 0 and py_.sum() > 0:
                s1, _, c1 = detect_step(px_, 3.0, 40.0)
                s2, _, c2 = detect_step(py_, 3.0, 40.0)
                steps.append(s1 if c1 >= c2 else s2)
        s_med = forced[0] if forced else float(np.median(steps)) if steps else sx
        if not forced:
            # one pixel size per sheet: refine the step by the summed comb score of all frames
            cand = np.arange(0.9 * s_med, 1.1 * s_med, 0.01)
            tot = [sum(detect_step_fixed(pp, sv)[2] for pr in profs.values() for pp in pr if pp.sum() > 0) for sv in cand]
            s_med = float(cand[int(np.argmax(tot))])
        sh = np.full((a.rows * H, a.cols * W), BG, dtype=np.int32)
        inf = []
        confs = []
        pending = []
        for (r, c, y0, y1, x0, x1) in regs:
            px_, py_ = profs[(r, c)]
            sub_idx = idx[y0:y1, x0:x1]
            if px_.sum() == 0 or py_.sum() == 0:
                cell, info = place(np.full((1, 1), BG, dtype=np.int32), W, H, a.anchor)
            else:
                fs = s_med  # same pixel size everywhere; only the phase is per frame
                _, fpx, fcx = detect_step_fixed(px_, fs)
                _, fpy, fcy = detect_step_fixed(py_, fs)
                confs.append(min(fcx, fcy))
                fx = grid_windows(px_, fs, fpx, sub_idx.shape[1], not a.fixed_grid)
                fy = grid_windows(py_, fs, fpy, sub_idx.shape[0], not a.fixed_grid)
                fart = despeckle(downsample(sub_idx, fx, fy), a.despeckle)
                if a.clean:
                    fart = clean_frame(fart)
                rows_fg = np.flatnonzero((fart != BG).any(axis=1))
                cols_fg = np.flatnonzero((fart != BG).any(axis=0))
                src_bottom = y0 + fy[rows_fg[-1]][1] if len(rows_fg) else None
                off = None
                if len(rows_fg):
                    # bbox centre of the kept art, in source px, relative to the cell slot centre
                    bx = (fx[cols_fg[0]][0] + fx[cols_fg[-1]][1]) / 2
                    by = (fy[rows_fg[0]][0] + fy[rows_fg[-1]][1]) / 2
                    off = ((bx - (x1 - x0) / 2) / fs, (by - (y1 - y0) / 2) / fs)
                pending.append((r, c, fart, src_bottom, round(fs, 2), round(min(fcx, fcy), 2), off))
                continue
            sh[r * H:(r + 1) * H, c * W:(c + 1) * W] = cell
            info.update(col=c, row=r)
            inf.append(info)
        # place grid-snapped frames; row-bottom keeps each frame's height over the row's ground
        ground = {}
        for (r, c, fart, sb, _, _, _) in pending:
            if sb is not None:
                ground[r] = max(ground.get(r, sb), sb)
        for (r, c, fart, sb, st, cf, off) in pending:
            lift = 0
            if a.anchor == "row-bottom" and sb is not None:
                lift = int(round((ground[r] - sb) / s_med))
                lift = lift if lift >= 2 else 0  # 1 px = sub-pixel noise of the generator
            cell, info = place(fart, W, H, a.anchor, lift, off)
            info.update(step=st, conf=cf, col=c, row=r, lift=lift)
            sh[r * H:(r + 1) * H, c * W:(c + 1) * W] = cell
            inf.append(info)
        inf.sort(key=lambda i: (i["row"], i["col"]))
        frames_pass.s_med = s_med
        frames_pass.conf = float(np.median(confs)) if confs else 0.0
        return sh, inf

    def resample_pass():
        # bands on the full-res image (a column counts as content if > 0.3% of it is fg)
        fgi = idx != BG
        fxb = bands(fgi.sum(0) > max(2, 0.003 * fgi.shape[0]), a.cols)
        fyb = bands(fgi.sum(1) > max(2, 0.003 * fgi.shape[1]), a.rows)
        sh = np.full((a.rows * H, a.cols * W), BG, dtype=np.int32)
        inf = []
        for r, (y0, y1) in enumerate(fyb):
            for c, (x0, x1) in enumerate(fxb):
                cell, info = resample_frame(idx[y0:y1, x0:x1], W, H, a.margin, a.anchor)
                cell = despeckle(cell, min(a.despeckle, 2))
                if a.clean:
                    cell = clean_frame(cell, rare=1)
                sh[r * H:(r + 1) * H, c * W:(c + 1) * W] = cell
                info.update(col=c, row=r)
                inf.append(info)
        return sh, inf

    mode = a.mode
    if mode == "grid":
        sheet, infos = grid_pass()
    elif mode == "frames":
        sheet, infos = frames_pass()
    elif mode == "resample":
        sheet, infos = resample_pass()
    else:
        sheet, infos = grid_pass()
        mode = "grid"
        if min(cx_, cy_) < 0.5 or any(i.get("scaled") for i in infos):
            sheet, infos = frames_pass()
            mode = "frames"
            if frames_pass.conf < 0.3 or any(i.get("scaled") for i in infos):
                sheet, infos = resample_pass()
                mode = "resample"

    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(to_rgba(sheet), "RGBA").save(a.out)
    if a.art_out:
        Image.fromarray(to_rgba(art), "RGBA").save(a.art_out)

    names = None
    if a.names:
        names = [n.strip() for n in a.names.split(",")]
    elif a.row_names:
        rn = [n.strip() for n in a.row_names.split(",")]
        names = [f"{rn[r]}_{c}" for r in range(a.rows) for c in range(a.cols)]
    if a.json:
        frames = []
        for k, info in enumerate(infos):
            f = {}
            if names and k < len(names):
                f["name"] = names[k]
            f.update(col=info["col"], row=info["row"])
            frames.append(f)
        doc = {"cell": [W, H], "cols": a.cols, "rows": a.rows, "frames": frames}
        Path(a.json).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")

    if a.report:
        med = median_colours(rgb, bgm, xs, ys)
        uniq = np.unique(med, axis=0) if len(med) else med
        exact = {tuple(p) for p in PAL.tolist()}
        off_exact = sum(1 for u in uniq.tolist() if tuple(u) not in exact)
        _, dd = nearest_palette(uniq) if len(uniq) else (None, np.array([]))
        off_far = int((dd > 30).sum())
        used = sorted({int(v) for v in np.unique(sheet) if v != BG})
        print(f"input        {a.input}  {img.width}x{img.height}")
        print(f"grid step    x={sx:.2f} (phase {px:.2f}, conf {cx_:.2f})  y={sy:.2f} (phase {py:.2f}, conf {cy_:.2f})")
        print(f"art size     {art.shape[1]}x{art.shape[0]} art px; content bands x={xb} y={yb}")
        print(f"off-palette  before: {off_exact} of {len(uniq)} distinct colours not exact palette, "
              f"{off_far} farther than 30 (redmean); after: 0 (sheet uses {len(used)} palette colours)")
        extra = ""
        if mode == "frames":
            extra = f"  (per-frame grid, median step {frames_pass.s_med:.2f}, median conf {frames_pass.conf:.2f})"
        elif mode == "resample":
            extra = "  (no usable pixel grid: block-majority resample)"
        print(f"mode         {mode}{extra}")
        print(f"sheet        {a.out}  {a.cols * W}x{a.rows * H}  cell {W}x{H}  anchor {a.anchor}")
        heights, bottoms, widths = [], [], []
        for k, info in enumerate(infos):
            nm = names[k] if names and k < len(names) else ""
            if info["empty"]:
                print(f"  [{info['row']},{info['col']}] {nm:14s} EMPTY")
                continue
            x, y, w, h = info["bbox"]
            heights.append(h)
            bottoms.append(y + h)
            widths.append(w)
            flag = "  SCALED from %dx%d (too big for cell!)" % tuple(info["src_size"]) if info["scaled"] else ""
            if info.get("resampled_from"):
                flag = "  resampled from %dx%d src px" % tuple(info["resampled_from"])
            if "step" in info:
                flag += f"  step {info['step']} conf {info['conf']}"
            if info.get("lift"):
                flag += f"  lift {info['lift']}"
            print(f"  [{info['row']},{info['col']}] {nm:14s} bbox x={x:2d} y={y:2d} w={w:2d} h={h:2d}{flag}")
        if heights:
            print(f"drift        height {min(heights)}..{max(heights)}, width {min(widths)}..{max(widths)}, "
                  f"baseline {min(bottoms)}..{max(bottoms)}")
    return 0


def detect_step_fixed(prof: np.ndarray, s: float):
    x = np.arange(len(prof), dtype=np.float64)
    tot = max(prof.sum(), 1e-9)
    z = (prof * np.exp(2j * np.pi * x / s)).sum() / tot
    return s, float((np.angle(z) / (2 * np.pi) * s) % s), float(abs(z))


if __name__ == "__main__":
    sys.exit(main())
