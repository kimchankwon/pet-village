#!/usr/bin/env python3
"""
Kirby pet frames — faithful export from the Tenor walk GIF.

Source: https://tenor.com/view/kirby-walk-gif-19699240
  scripts/reference/kirby/tenor-kirby-walk.gif
  scripts/reference/kirby/gif-frames/f000.png … f009.png
  scripts/reference/kirby/user-walk-frame.png  (== GIF f0)

Strategy: do NOT crush to 32×32. Key only pure white plate, keep the GIF's
own colors and resolution, pad every frame to a shared bottom-aligned canvas.
In-game nearest-neighbour scale (petDrawScale) then matches the reference
sticker closely.

Extract frames first:
  python3 scripts/extract-kirby-gif-frames.py

Run:
  python3 scripts/kirby-from-tenor-gif.py
  # or: npm run sprite:kirby
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
GIF = ROOT / "scripts/reference/kirby/gif-frames"
OUT = ROOT / "public/assets/pet/kirby"
N_FRAMES = 10


def is_plate_white(r: int, g: int, b: int, a: int = 255) -> bool:
    """Only the GIF's solid white backdrop — never pinks, reds, or greys."""
    if a < 20:
        return True
    lum = (r + g + b) / 3.0
    sat = max(r, g, b) - min(r, g, b)
    return sat < 18 and lum > 245


def load_keyed(path: Path) -> Image.Image:
    im = Image.open(path).convert("RGBA")
    px = im.load()
    out = Image.new("RGBA", im.size, (0, 0, 0, 0))
    op = out.load()
    assert px is not None and op is not None
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if is_plate_white(r, g, b, a):
                continue
            # Snap pure outline ink only; leave every other GIF pixel exact.
            if r + g + b < 40:
                op[x, y] = (0, 0, 0, 255)
            else:
                op[x, y] = (r, g, b, 255)
    return out


def content_bbox(im: Image.Image) -> tuple[int, int, int, int]:
    px = im.load()
    assert px is not None
    xs: list[int] = []
    ys: list[int] = []
    for y in range(im.height):
        for x in range(im.width):
            if px[x, y][3] >= 20:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise RuntimeError(f"empty frame after keying: {im.size}")
    return min(xs), min(ys), max(xs), max(ys)


def place(
    im: Image.Image,
    bb: tuple[int, int, int, int],
    cw: int,
    ch: int,
) -> Image.Image:
    x0, y0, x1, y1 = bb
    crop = im.crop((x0, y0, x1 + 1, y1 + 1))
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    ox = (cw - crop.width) // 2
    oy = ch - crop.height - 1
    canvas.paste(crop, (ox, oy), crop)
    return canvas


def main() -> None:
    if not (GIF / "f000.png").exists():
        raise SystemExit(
            "Missing gif frames. Run: python3 scripts/extract-kirby-gif-frames.py"
        )

    OUT.mkdir(parents=True, exist_ok=True)
    frames: list[tuple[Image.Image, tuple[int, int, int, int]]] = []
    for i in range(N_FRAMES):
        im = load_keyed(GIF / f"f{i:03d}.png")
        bb = content_bbox(im)
        frames.append((im, bb))
        print(f"f{i:03d} {bb[2] - bb[0] + 1}x{bb[3] - bb[1] + 1}")

    max_w = max(bb[2] - bb[0] + 1 for _, bb in frames)
    max_h = max(bb[3] - bb[1] + 1 for _, bb in frames)
    pad = 2
    cw = max_w + pad * 2
    ch = max_h + pad * 2
    print(f"canvas {cw}x{ch}")

    walks: list[Image.Image] = []
    for i, (im, bb) in enumerate(frames):
        placed = place(im, bb, cw, ch)
        dest = OUT / f"walk{i + 1}.png"
        placed.save(dest)
        walks.append(placed)
        print("wrote", dest.name)

    idle = walks[0]
    idle.save(OUT / "neutral1.png")

    n2 = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    n2.paste(idle, (0, 2), idle)
    n2.save(OUT / "neutral2.png")

    happy = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    happy.paste(idle, (0, -4), idle)
    happy.save(OUT / "happy.png")

    sad = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    sad.paste(idle, (0, 3), idle)
    sad.save(OUT / "sad.png")

    # Sleep: paint over eye sclera whites, draw closed lids.
    sleep = idle.copy()
    sp = sleep.load()
    assert sp is not None
    eye_pts = [
        (x, y)
        for y in range(ch)
        for x in range(cw)
        if sp[x, y][3] > 0
        and sp[x, y][0] > 230
        and sp[x, y][1] > 230
        and sp[x, y][2] > 230
    ]
    if eye_pts:
        mid = sum(p[0] for p in eye_pts) / len(eye_pts)
        body = (255, 170, 200, 255)
        for pred in (lambda p: p[0] < mid, lambda p: p[0] >= mid):
            pts = [p for p in eye_pts if pred(p)]
            if not pts:
                continue
            ex = sum(p[0] for p in pts) // len(pts)
            ey = sum(p[1] for p in pts) // len(pts)
            for x, y in pts:
                if abs(x - ex) < 14 and abs(y - ey) < 16:
                    sp[x, y] = body
            for dx in range(-6, 7):
                x, y = ex + dx, ey + 2
                if 0 <= x < cw and 0 <= y < ch and sp[x, y][3] > 0:
                    sp[x, y] = (0, 0, 0, 255)
    sleep.save(OUT / "sleep.png")

    jump = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    jump.paste(idle, (0, -12), idle)
    jump.save(OUT / "jump.png")

    print("Done — Kirby walk1–walk10 match Tenor GIF f0–f9 at plate resolution.")


if __name__ == "__main__":
    main()
