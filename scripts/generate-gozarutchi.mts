/**
 * Gozarutchi pet frames from the Tamagotchi iD fandom gallery.
 *
 * Walk: File:IDGozarutchiWalk.png / Walk2.png
 * (https://tamagotchi.fandom.com/wiki/Gozarutchi/Sprite_Gallery § Tamagotchi iD)
 *
 * Reference PNGs: scripts/reference/gozarutchi/frames/
 * Each is padded to the shared 32×32 bottom-aligned pet canvas.
 *
 * Run: npx tsx scripts/generate-gozarutchi.mts
 *   or: npm run sprite:gozarutchi
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { saveSprite } from './lib/save-sprite.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const REF = path.resolve('scripts/reference/gozarutchi/frames');
const OUT = path.resolve('public/assets/pet/gozarutchi');
const W = 32;
const H = 32;
const OUTLINE: [number, number, number, number] = [0, 0, 0, 255];

const POSES = [
  'neutral1',
  'neutral2',
  'walk1',
  'walk2',
  'happy',
  'sad',
  'sleep',
  'jump',
] as const;

function blank() {
  const png = new PNG({ width: W, height: H });
  png.data.fill(0);
  return png;
}

function contentBounds(png: InstanceType<typeof PNG>) {
  let x0 = png.width;
  let y0 = png.height;
  let x1 = 0;
  let y1 = 0;
  let n = 0;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2;
      if (png.data[i + 3]! < 20) continue;
      n++;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (!n) throw new Error('empty gozarutchi frame');
  return { x0, y0, x1, y1 };
}

function toCanvas(src: InstanceType<typeof PNG>) {
  const b = contentBounds(src);
  const cw = b.x1 - b.x0 + 1;
  const ch = b.y1 - b.y0 + 1;
  const out = blank();
  const ox = Math.floor((W - cw) / 2);
  const oy = H - ch;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const si = (src.width * (b.y0 + y) + (b.x0 + x)) << 2;
      if (src.data[si + 3]! < 20) continue;
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      const di = (W * dy + dx) << 2;
      out.data[di] = src.data[si]!;
      out.data[di + 1] = src.data[si + 1]!;
      out.data[di + 2] = src.data[si + 2]!;
      out.data[di + 3] = 255;
    }
  }
  return out;
}

// Preflight: load every reference frame before writing any output so a missing
// mid-pose file cannot leave public/assets/pet/gozarutchi half-updated.
const loaded: { pose: (typeof POSES)[number]; canvas: InstanceType<typeof PNG> }[] = [];
for (const pose of POSES) {
  const file = path.join(REF, `${pose}.png`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing reference frame ${file}`);
  }
  const src = PNG.sync.read(fs.readFileSync(file));
  loaded.push({ pose, canvas: toCanvas(src) });
}

fs.mkdirSync(OUT, { recursive: true });
for (const { pose, canvas } of loaded) {
  // Gallery art already has a dark outline (~0,0,99). repairOutline would
  // paint a second pure-black ring outside it — skip that double outline.
  saveSprite(canvas, path.join(OUT, `${pose}.png`), {
    repairOutline: false,
    cleanExterior: false,
    outline: OUTLINE,
  });
  console.log('wrote', pose);
}
console.log('Gozarutchi iD sprites written to', OUT);
