#!/usr/bin/env python3
"""Extract Tenor Kirby walk GIF frames into scripts/reference/kirby/gif-frames/."""
from pathlib import Path
from PIL import Image, ImageSequence

ROOT = Path(__file__).resolve().parents[1]
GIF = ROOT / 'scripts/reference/kirby/tenor-kirby-walk.gif'
OUT = ROOT / 'scripts/reference/kirby/gif-frames'
OUT.mkdir(parents=True, exist_ok=True)

gif = Image.open(GIF)
for i, frame in enumerate(ImageSequence.Iterator(gif)):
    im = frame.convert('RGBA')
    bg = Image.new('RGBA', im.size, (255, 255, 255, 255))
    bg.alpha_composite(im)
    path = OUT / f'f{i:03d}.png'
    bg.save(path)
    print('wrote', path, im.size)
print('frames', i + 1)
