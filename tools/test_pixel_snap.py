#!/usr/bin/env python3
"""Self-test for pixel_snap.py: a known 24x32 sprite (and a 3x2 sheet of 16x16 items) is
upscaled x16 onto a magenta canvas, blurred, JPEG-compressed, then recovered.
Run: python3 tools/test_pixel_snap.py"""
import io
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).parent))
import pixel_snap as ps  # noqa: E402

rng = np.random.default_rng(7)
P = {k: i for i, k in enumerate(ps.PALETTE_HEX)}


def hero() -> np.ndarray:
    a = np.full((32, 24), ps.BG, dtype=np.int32)
    a[2:12, 6:18] = P["cream"]          # head
    a[2:5, 6:18] = P["brownDark"]       # hair
    a[7, 9] = a[7, 14] = P["ink"]       # eyes
    a[12:14, 5:19] = P["brick"]         # scarf
    a[13:20, 16:19] = P["brick"]        # scarf tail
    a[14:24, 7:17] = P["slate"]         # jacket
    a[14:24, 7:9] = P["slateDark"]      # shade
    a[24:30, 8:11] = P["navy"]          # legs
    a[24:30, 13:16] = P["navy"]
    a[30:32, 7:11] = P["brown"]         # shoes
    a[30:32, 13:17] = P["brown"]
    a[16:22, 5:7] = P["cream"]          # hand
    return a


def item(seed: int) -> np.ndarray:
    r = np.random.default_rng(seed)
    a = np.full((16, 16), ps.BG, dtype=np.int32)
    h, w = r.integers(8, 15), r.integers(8, 15)
    y, x = (16 - h) // 2, (16 - w) // 2
    a[y:y + h, x:x + w] = r.integers(0, 32)
    a[y + 1:y + h - 1, x + 1:x + w // 2] = r.integers(0, 32)
    return a


def degrade(art: np.ndarray, scale: int, canvas: tuple[int, int], off: tuple[int, int]) -> Image.Image:
    rgba = ps.to_rgba(art)
    rgb = np.where(rgba[..., 3:] > 0, rgba[..., :3], np.array([255, 0, 255], np.uint8))
    up = Image.fromarray(rgb.astype(np.uint8)).resize((art.shape[1] * scale, art.shape[0] * scale), Image.NEAREST)
    can = Image.new("RGB", canvas, (255, 0, 255))
    can.paste(up, off)
    can = can.filter(ImageFilter.GaussianBlur(1.2))
    buf = io.BytesIO()
    can.save(buf, "JPEG", quality=70)
    return Image.open(io.BytesIO(buf.getvalue())).convert("RGB")


def crop(a):
    fg = a != ps.BG
    ys, xs = np.nonzero(fg)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def run(img: Image.Image, args: list[str], tmp: Path) -> np.ndarray:
    src = tmp / "in.png"
    img.save(src)
    out = tmp / "out.png"
    ps.main([str(src), "--out", str(out), "--report", *args])
    rgba = np.asarray(Image.open(out).convert("RGBA"))
    idx, _ = ps.nearest_palette(rgba[..., :3].reshape(-1, 3).astype(np.int32))
    idx = idx.reshape(rgba.shape[:2])
    idx[rgba[..., 3] == 0] = ps.BG
    return idx


def main() -> int:
    ok = True
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        # 1. single hero, x16, odd offset
        h = hero()
        got = run(degrade(h, 16, (1024, 1024), (301, 173)), ["--cell", "24x32", "--cols", "1", "--rows", "1"], tmp)
        same = np.array_equal(crop(got), crop(h))
        print("TEST hero x16 blur+jpeg:", "PASS" if same else "FAIL")
        ok &= same
        # 2. 3x2 items sheet, x16 with uneven gaps
        items = [item(s) for s in range(6)]
        sheet = np.full((16 * 2 + 5, 16 * 3 + 7), ps.BG, dtype=np.int32)
        for k, it in enumerate(items):
            r, c = divmod(k, 3)
            sheet[r * 19:r * 19 + 16, c * 19:c * 19 + 16] = it
        got = run(degrade(sheet, 16, (1100, 800), (90, 77)),
                  ["--cell", "16x16", "--cols", "3", "--rows", "2", "--anchor", "center"], tmp)
        good = 0
        for k, it in enumerate(items):
            r, c = divmod(k, 3)
            good += np.array_equal(crop(got[r * 16:(r + 1) * 16, c * 16:(c + 1) * 16]), crop(it))
        print(f"TEST items 3x2 x16 blur+jpeg: {good}/6", "PASS" if good == 6 else "FAIL")
        ok &= good == 6
        # 3. non-integer scale (x13.7) like a resized generator output
        art = hero()
        rgba = ps.to_rgba(art)
        rgb = np.where(rgba[..., 3:] > 0, rgba[..., :3], np.array([255, 0, 255], np.uint8))
        up = Image.fromarray(rgb.astype(np.uint8)).resize((round(24 * 13.7), round(32 * 13.7)), Image.NEAREST)
        can = Image.new("RGB", (800, 800), (255, 0, 255))
        can.paste(up, (123, 99))
        buf = io.BytesIO()
        can.filter(ImageFilter.GaussianBlur(0.8)).save(buf, "JPEG", quality=75)
        got = run(Image.open(io.BytesIO(buf.getvalue())).convert("RGB"),
                  ["--cell", "24x32", "--cols", "1", "--rows", "1"], tmp)
        same = np.array_equal(crop(got), crop(art))
        print("TEST hero x13.7 blur+jpeg:", "PASS" if same else "FAIL")
        ok &= same
    print("ALL PASS" if ok else "SOME FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
