/**
 * Cinnamoroll frames cut directly from the supplied reference sheet.
 *
 * This preserves every authored source pixel (including the full ears and
 * mouth) rather than resampling an inferred logical grid. The warm paper is
 * made transparent; every non-paper source pixel is copied 1:1.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve('public/assets/npc/cinnamoroll');
const SOURCE = path.resolve('scripts/reference/cinnamoroll-reference-sheet.png');
type RGBA = [number, number, number, number];
type Pose = 'idle' | 'walk1' | 'walk2' | 'jump' | 'sad' | 'happy';
type Crop = { pose: Pose; x: number; y: number; width: number; height: number; bottom: number };

// Bounds include four source pixels of breathing room around each detected
// sprite. They deliberately include the entire ear span and facial pixels.
const CROPS: Crop[] = [
  { pose: 'idle', x: 17, y: 49, width: 187, height: 155, bottom: 152 },
  { pose: 'walk1', x: 191, y: 49, width: 183, height: 153, bottom: 151 },
  { pose: 'jump', x: 360, y: 58, width: 188, height: 154, bottom: 143 },
  { pose: 'walk2', x: 540, y: 58, width: 165, height: 144, bottom: 142 },
  { pose: 'sad', x: 191, y: 531, width: 180, height: 162, bottom: 140 },
  { pose: 'happy', x: 550, y: 516, width: 172, height: 177, bottom: 156 },
];

const PAPER: RGBA = [251, 244, 224, 255];
// Preserve the reference silhouette pixel-for-pixel while consolidating its
// screenshot noise into Cinnamoroll's five authored sprite colors.
const PALETTE: RGBA[] = [
  [32, 39, 40, 255],
  [255, 255, 247, 255],
  [193, 234, 240, 255],
  [47, 68, 77, 255], // muted blue-black eyes; avoids saturated face artifacts
  [249, 185, 182, 255],
];

function read(source: InstanceType<typeof PNG>, x: number, y: number): RGBA {
  const i = (y * source.width + x) << 2;
  return [source.data[i]!, source.data[i + 1]!, source.data[i + 2]!, source.data[i + 3]!];
}

function distance(a: RGBA, b: RGBA) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function isPaper([r, g, b]: RGBA) {
  // Keep white fur; only remove the sheet's distinctly warm cream paper.
  return r - b > 15 && g - b > 10 && distance([r, g, b, 255], PAPER) < 105;
}

function quantize([r, g, b]: RGBA): RGBA {
  const brightness = (r + g + b) / 3;
  if (brightness < 125) return PALETTE[0]!;
  if (r > g + 18 && r > b + 18) return PALETTE[4]!;
  // Cyan is reserved for intentional blue eyes and ear/body shadows. Neutral
  // anti-aliasing pixels should remain fur rather than turn into blue blotches.
  if (b > r + 22 && g > r + 14) return brightness < 175 ? PALETTE[3]! : PALETTE[2]!;
  return PALETTE[1]!;
}

function isLightNeutral([r, g, b]: RGBA) {
  return Math.max(r, g, b) - Math.min(r, g, b) < 30 && (r + g + b) / 3 > 160;
}

function set(output: InstanceType<typeof PNG>, x: number, y: number, color: RGBA) {
  const pixel = quantize(color);
  const i = (y * output.width + x) << 2;
  output.data[i] = pixel[0];
  output.data[i + 1] = pixel[1];
  output.data[i + 2] = pixel[2];
  output.data[i + 3] = pixel[3];
}

function cleanup(output: InstanceType<typeof PNG>, bottom: number) {
  const seen = new Uint8Array(output.width * output.height);
  const components: { pixels: number[]; minX: number; maxX: number; minY: number; maxY: number }[] = [];
  for (let y = 0; y < output.height; y++) for (let x = 0; x < output.width; x++) {
    const start = y * output.width + x;
    if (seen[start] || output.data[start * 4 + 3] === 0) continue;
    const pixels = [start]; seen[start] = 1;
    let minX = x, maxX = x, minY = y, maxY = y;
    for (let i = 0; i < pixels.length; i++) {
      const index = pixels[i]!; const px = index % output.width; const py = Math.floor(index / output.width);
      minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = px + dx, ny = py + dy, next = ny * output.width + nx;
        if (nx >= 0 && ny >= 0 && nx < output.width && ny < output.height && !seen[next] && output.data[next * 4 + 3] !== 0) { seen[next] = 1; pixels.push(next); }
      }
    }
    components.push({ pixels, minX, maxX, minY, maxY });
  }
  const body = components.reduce((largest, component) => component.pixels.length > largest.pixels.length ? component : largest);
  for (const component of components) {
    const belowSprite = component.minY > bottom;
    const detachedOutsideBody = component !== body && (component.minX < body.minX || component.maxX > body.maxX || component.minY < body.minY || component.maxY > body.maxY);
    const tinyOutsideBody = component.pixels.length < 10 && detachedOutsideBody;
    if (belowSprite || detachedOutsideBody || tinyOutsideBody) for (const index of component.pixels) output.data[index * 4 + 3] = 0;
  }
}

function trimWhiteOutsideOutline(output: InstanceType<typeof PNG>) {
  const [wr, wg, wb] = PALETTE[1]!;
  // A correct outline shields fur from transparency. Any white pixel exposed to
  // the outside is paper/anti-alias spill rather than intentional fur.
  for (let pass = 0; pass < 3; pass++) {
    const remove: number[] = [];
    for (let y = 0; y < output.height; y++) for (let x = 0; x < output.width; x++) {
      const index = y * output.width + x, i = index * 4;
      if (output.data[i + 3] === 0 || output.data[i] !== wr || output.data[i + 1] !== wg || output.data[i + 2] !== wb) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= output.width || ny >= output.height || output.data[(ny * output.width + nx) * 4 + 3] === 0) { remove.push(i); break; }
      }
    }
    for (const i of remove) output.data[i + 3] = 0;
  }
}

function extract(source: InstanceType<typeof PNG>, crop: Crop) {
  const output = new PNG({ width: crop.width, height: crop.height });
  output.data.fill(0);
  const outside = new Uint8Array(crop.width * crop.height);
  const isBackgroundCandidate = (x: number, y: number) => {
    const color = read(source, crop.x + x, crop.y + y);
    return isPaper(color) || isLightNeutral(color);
  };
  const queue: number[] = [];
  const addOutside = (x: number, y: number) => {
    const index = y * crop.width + x;
    if (!outside[index] && isBackgroundCandidate(x, y)) { outside[index] = 1; queue.push(index); }
  };
  for (let x = 0; x < crop.width; x++) { addOutside(x, 0); addOutside(x, crop.height - 1); }
  for (let y = 1; y < crop.height - 1; y++) { addOutside(0, y); addOutside(crop.width - 1, y); }
  for (let i = 0; i < queue.length; i++) {
    const index = queue[i]!; const x = index % crop.width; const y = Math.floor(index / crop.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < crop.width && ny < crop.height) addOutside(nx, ny);
    }
  }
  for (let y = 0; y < crop.height; y++) for (let x = 0; x < crop.width; x++) {
    const index = y * crop.width + x;
    if (!outside[index]) {
      const color = read(source, crop.x + x, crop.y + y);
      if (!isPaper(color)) {
        const pixel = quantize(color);
        const white = PALETTE[1]!;
        const i = index * 4;
        if (pixel[0] === 32 && pixel[1] === 39 && pixel[2] === 40) {
          output.data[i] = pixel[0]; output.data[i + 1] = pixel[1]; output.data[i + 2] = pixel[2]; output.data[i + 3] = pixel[3];
        } else {
          output.data[i] = white[0]; output.data[i + 1] = white[1]; output.data[i + 2] = white[2]; output.data[i + 3] = white[3];
        }
      }
    }
  }
  cleanup(output, crop.bottom);
  trimWhiteOutsideOutline(output);
  return output;
}

const source = PNG.sync.read(fs.readFileSync(SOURCE));
if (source.width !== 736 || source.height !== 736) throw new Error(`Unexpected reference dimensions: ${source.width}×${source.height}`);
fs.mkdirSync(ROOT, { recursive: true });
for (const crop of CROPS) fs.writeFileSync(path.join(ROOT, `${crop.pose}.png`), PNG.sync.write(extract(source, crop)));
console.log('Copied full-ear, full-mouth Cinnamoroll source pixels 1:1');
