/**
 * Convert Grok Imagine accessory plates into 32×32 transparent overlays.
 *
 * Source: scripts/reference/accessories/<id>.jpg|png
 * Output: public/assets/accessories/<id>.png
 *
 * Placement anchors content into a 32×32 pet-canvas region by slot so
 * overlays sit on head/body correctly when centered on the pet.
 *
 *   npx tsx scripts/process-accessories.mts
 *   npx tsx scripts/process-accessories.mts --only=aqua-clip,cloud-bow
 *   npx tsx scripts/process-accessories.mts --only aqua-clip,cloud-bow
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import { cleanSpriteExterior } from './lib/clean-sprite.mjs';
import { repairExternalOutline } from './lib/pixel-outline.mjs';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const REF = path.resolve('scripts/reference/accessories');
const OUT = path.resolve('public/assets/accessories');
const TMP = path.resolve('scripts/tmp/accessories');
const SIZE = 32;

type RGBA = [number, number, number, number];
const OUTLINE: RGBA = [0, 0, 0, 255];

/** Where to plant the cropped content on the 32×32 pet canvas. */
type Anchor = {
  /** Target max side of the content inside 32×32. */
  maxSide: number;
  /** Content center x (0–31). */
  cx: number;
  /** Content center y (0–31). */
  cy: number;
};

const JOBS: Record<string, Anchor> = {
  // Bongbongee — new Imagine set
  'aqua-clip': { maxSide: 14, cx: 8, cy: 5 },
  'mint-puff': { maxSide: 12, cx: 24, cy: 5 },
  'diamond-tee': { maxSide: 22, cx: 16, cy: 23 },
  'carat-sash': { maxSide: 20, cx: 16, cy: 20 },
  // Cinnamoroll cafe — refreshed alignment
  'cloud-bow': { maxSide: 14, cx: 9, cy: 7 },
  'ear-cloud': { maxSide: 12, cx: 24, cy: 5 },
  'cafe-apron': { maxSide: 16, cx: 16, cy: 24 },
  'cinnamon-scarf': { maxSide: 18, cx: 16, cy: 22 },
  // Pet boutique — Kirby / Tama
  'chef-toque': { maxSide: 16, cx: 16, cy: 5 },
  'star-band': { maxSide: 18, cx: 16, cy: 12 },
  'top-bow': { maxSide: 12, cx: 16, cy: 8 },
  'kirby-bowtie': { maxSide: 16, cx: 16, cy: 23 },
  'mini-crown': { maxSide: 16, cx: 16, cy: 5 },
  'ribbon-tie': { maxSide: 16, cx: 16, cy: 22 },
  // Puffle dig finds — better body/face fit
  'puffle-tee': { maxSide: 20, cx: 16, cy: 24 },
  'puffle-cape': { maxSide: 18, cx: 14, cy: 18 },
  'feather-boa': { maxSide: 18, cx: 16, cy: 21 },
  'propeller-hat': { maxSide: 18, cx: 16, cy: 6 },
  'newspaper-hat': { maxSide: 16, cx: 16, cy: 6 },
  snorkel: { maxSide: 18, cx: 14, cy: 10 },
  'glam-glasses': { maxSide: 18, cx: 16, cy: 14 },
  'brown-goggles': { maxSide: 18, cx: 16, cy: 14 },
  'big-sunglasses': { maxSide: 20, cx: 16, cy: 14 },
};

function blank(w: number, h: number) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0);
  return png;
}

function get(png: InstanceType<typeof PNG>, x: number, y: number): RGBA {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return [0, 0, 0, 0];
  const i = (png.width * y + x) << 2;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!, png.data[i + 3]!];
}

function set(png: InstanceType<typeof PNG>, x: number, y: number, c: RGBA) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = c[0];
  png.data[i + 1] = c[1];
  png.data[i + 2] = c[2];
  png.data[i + 3] = c[3];
}

function jpgToPngBuffer(jpgPath: string): Buffer {
  fs.mkdirSync(TMP, { recursive: true });
  const tmpPng = path.join(TMP, `${path.basename(jpgPath, path.extname(jpgPath))}.raw.png`);
  execFileSync('sips', ['-s', 'format', 'png', jpgPath, '--out', tmpPng], { stdio: 'pipe' });
  return fs.readFileSync(tmpPng);
}

function loadRef(name: string): InstanceType<typeof PNG> | null {
  for (const ext of ['.jpg', '.jpeg', '.png']) {
    const p = path.join(REF, name + ext);
    if (!fs.existsSync(p)) continue;
    const buf = ext === '.png' ? fs.readFileSync(p) : jpgToPngBuffer(p);
    return PNG.sync.read(buf);
  }
  return null;
}

function removeGreenKey(src: InstanceType<typeof PNG>): InstanceType<typeof PNG> {
  const out = blank(src.width, src.height);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const c = get(src, x, y);
      const [r, g, b, a] = c;
      // Lime / pure green key
      if (g > 160 && g - r > 50 && g - b > 50) continue;
      if (g > 200 && r < 90 && b < 90) continue;
      // Magenta key (legacy)
      if (r > 180 && b > 140 && g < 120 && r - g > 50) continue;
      if (a < 20) continue;
      set(out, x, y, [r, g, b, 255]);
    }
  }
  return out;
}

function contentBounds(png: InstanceType<typeof PNG>, alpha = 20) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(png.width * y + x) * 4 + 3]! < alpha) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

function crop(src: InstanceType<typeof PNG>, pad = 2) {
  const b = contentBounds(src);
  if (!b) return src;
  const w = b.maxX - b.minX + 1 + pad * 2;
  const h = b.maxY - b.minY + 1 + pad * 2;
  const out = blank(w, h);
  for (let y = b.minY; y <= b.maxY; y++) {
    for (let x = b.minX; x <= b.maxX; x++) {
      set(out, x - b.minX + pad, y - b.minY + pad, get(src, x, y));
    }
  }
  return out;
}

function scaleToMax(src: InstanceType<typeof PNG>, maxSide: number) {
  const m = Math.max(src.width, src.height);
  if (m <= maxSide) return src;
  const scale = maxSide / m;
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x / scale));
      set(out, x, y, get(src, sx, sy));
    }
  }
  return out;
}

function placeOnCanvas(src: InstanceType<typeof PNG>, anchor: Anchor) {
  const scaled = scaleToMax(src, anchor.maxSide);
  const out = blank(SIZE, SIZE);
  const ox = Math.round(anchor.cx - scaled.width / 2);
  const oy = Math.round(anchor.cy - scaled.height / 2);
  for (let y = 0; y < scaled.height; y++) {
    for (let x = 0; x < scaled.width; x++) {
      const c = get(scaled, x, y);
      if (c[3]! < 20) continue;
      set(out, ox + x, oy + y, c);
    }
  }
  return out;
}

function processOne(name: string, anchor: Anchor) {
  const src = loadRef(name);
  if (!src) {
    console.warn(`skip missing ${name}`);
    return;
  }
  for (let i = 0; i < src.width * src.height; i++) {
    const o = i << 2;
    if (src.data[o + 3]! > 0 && src.data[o + 3]! < 255) src.data[o + 3] = 255;
  }
  let keyed = removeGreenKey(src);
  keyed = crop(keyed, 4);
  if (!(keyed.data instanceof Buffer)) keyed.data = Buffer.from(keyed.data);
  cleanSpriteExterior(keyed, { outline: OUTLINE, tolerance: 48, repairOutline: false });
  let placed = placeOnCanvas(keyed, anchor);
  if (!(placed.data instanceof Buffer)) placed.data = Buffer.from(placed.data);
  placed = repairExternalOutline(placed, { outline: OUTLINE, tolerance: 48 });
  fs.mkdirSync(OUT, { recursive: true });
  if (!(placed.data instanceof Buffer)) placed.data = Buffer.from(placed.data);
  fs.writeFileSync(path.join(OUT, `${name}.png`), PNG.sync.write(placed));
  console.log(`wrote ${name}.png ${SIZE}×${SIZE}`);
}

function parseOnlyArg(argv: string[]): Set<string> | null {
  const eq = argv.find((a) => a.startsWith('--only='));
  if (eq) {
    return new Set(eq.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
  }
  const idx = argv.indexOf('--only');
  const next = idx >= 0 ? argv[idx + 1] : undefined;
  if (next && !next.startsWith('-')) {
    return new Set(next.split(',').map((s) => s.trim()).filter(Boolean));
  }
  return null;
}

const only = parseOnlyArg(process.argv);

for (const [name, anchor] of Object.entries(JOBS)) {
  if (only && !only.has(name)) continue;
  processOne(name, anchor);
}
console.log('done');
