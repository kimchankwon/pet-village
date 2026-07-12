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

function set(output: InstanceType<typeof PNG>, x: number, y: number, color: RGBA) {
  const i = (y * output.width + x) << 2;
  output.data[i] = color[0];
  output.data[i + 1] = color[1];
  output.data[i + 2] = color[2];
  output.data[i + 3] = color[3];
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

function extract(source: InstanceType<typeof PNG>, crop: Crop) {
  const output = new PNG({ width: crop.width, height: crop.height });
  output.data.fill(0);
  for (let y = 0; y < crop.height; y++) {
    for (let x = 0; x < crop.width; x++) {
      const color = read(source, crop.x + x, crop.y + y);
      if (!isPaper(color)) set(output, x, y, color);
    }
  }
  cleanup(output, crop.bottom);
  return output;
}

const source = PNG.sync.read(fs.readFileSync(SOURCE));
if (source.width !== 736 || source.height !== 736) throw new Error(`Unexpected reference dimensions: ${source.width}×${source.height}`);
fs.mkdirSync(ROOT, { recursive: true });
for (const crop of CROPS) fs.writeFileSync(path.join(ROOT, `${crop.pose}.png`), PNG.sync.write(extract(source, crop)));
console.log('Copied full-ear, full-mouth Cinnamoroll source pixels 1:1');
