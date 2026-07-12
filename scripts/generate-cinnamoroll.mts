/**
 * Cinnamoroll frames resampled from the reference sheet's logical pixel
 * grid. The sheet is really a low-res sprite drawn in ~7px blocks with
 * compression noise on top, so instead of copying source pixels 1:1 and
 * repairing holes afterwards, each 7x7 block majority-votes into one of
 * the five sprite colors (or transparent paper). Output frames are true
 * pixel size (~26x22); the game scales them up with pixelArt filtering.
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

// The logical pixel pitch of the sheet (measured by variance minimisation).
const CELL = 7;

// Bounds include breathing room around each detected sprite; `bottom` cuts
// off the caption text under each pose.
const CROPS: Crop[] = [
  { pose: 'idle', x: 17, y: 49, width: 187, height: 155, bottom: 152 },
  { pose: 'walk1', x: 191, y: 49, width: 183, height: 153, bottom: 151 },
  { pose: 'jump', x: 360, y: 58, width: 188, height: 154, bottom: 143 },
  { pose: 'walk2', x: 540, y: 58, width: 165, height: 144, bottom: 142 },
  { pose: 'sad', x: 191, y: 531, width: 180, height: 162, bottom: 140 },
  { pose: 'happy', x: 550, y: 516, width: 172, height: 177, bottom: 156 },
];

const PALETTE: RGBA[] = [
  [32, 39, 40, 255], // outline
  [255, 255, 247, 255], // fur
  [193, 234, 240, 255], // light cyan shading
  [47, 68, 77, 255], // blue-black eyes
  [249, 185, 182, 255], // blush
];

function read(source: InstanceType<typeof PNG>, x: number, y: number): RGBA {
  const i = (y * source.width + x) << 2;
  return [source.data[i]!, source.data[i + 1]!, source.data[i + 2]!, source.data[i + 3]!];
}

/** Classify one source pixel: -1 = paper, otherwise a PALETTE index. */
function classify([r, g, b]: RGBA): number {
  // The sheet's warm cream paper: noticeably warmer than the blue-white fur.
  if (r - b > 15 && g - b > 10 && Math.hypot(r - 251, g - 244, b - 224) < 105) return -1;
  const brightness = (r + g + b) / 3;
  if (brightness < 125) return 0; // outline / dark eye pixels
  if (r > g + 18 && r > b + 18) return 4; // warm pink = blush
  if (b > r + 22 && g > r + 14) return brightness < 175 ? 3 : 2; // blue eye / cyan shade
  return 1; // fur
}

/** Grid offset that best aligns cell interiors with uniform color blocks. */
function detectOffset(source: InstanceType<typeof PNG>, crop: Crop): { ox: number; oy: number } {
  let best = { ox: 0, oy: 0, score: Infinity };
  for (let oy = 0; oy < CELL; oy++) {
    for (let ox = 0; ox < CELL; ox++) {
      let total = 0;
      let cells = 0;
      for (let gy = 0; oy + (gy + 1) * CELL <= crop.height; gy++) {
        for (let gx = 0; ox + (gx + 1) * CELL <= crop.width; gx++) {
          let sr = 0, sg = 0, sb = 0, n = 0;
          for (let y = oy + gy * CELL + 1; y < oy + (gy + 1) * CELL - 1; y++) {
            for (let x = ox + gx * CELL + 1; x < ox + (gx + 1) * CELL - 1; x++) {
              const [r, g, b] = read(source, crop.x + x, crop.y + y);
              sr += r; sg += g; sb += b; n++;
            }
          }
          const mr = sr / n, mg = sg / n, mb = sb / n;
          let v = 0;
          for (let y = oy + gy * CELL + 1; y < oy + (gy + 1) * CELL - 1; y++) {
            for (let x = ox + gx * CELL + 1; x < ox + (gx + 1) * CELL - 1; x++) {
              const [r, g, b] = read(source, crop.x + x, crop.y + y);
              v += (r - mr) ** 2 + (g - mg) ** 2 + (b - mb) ** 2;
            }
          }
          total += v / n;
          cells++;
        }
      }
      const score = total / cells;
      if (score < best.score) best = { ox, oy, score };
    }
  }
  return best;
}

function extract(source: InstanceType<typeof PNG>, crop: Crop) {
  const { ox, oy } = detectOffset(source, crop);
  const gw = Math.floor((crop.width - ox) / CELL);
  const gh = Math.floor((Math.min(crop.height, crop.bottom) - oy) / CELL);
  const output = new PNG({ width: gw, height: gh });
  output.data.fill(0);
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      // Majority vote over the block (paper counts as a candidate too)
      const votes = new Map<number, number>();
      for (let y = oy + gy * CELL; y < oy + (gy + 1) * CELL; y++) {
        for (let x = ox + gx * CELL; x < ox + (gx + 1) * CELL; x++) {
          const cls = classify(read(source, crop.x + x, crop.y + y));
          votes.set(cls, (votes.get(cls) ?? 0) + 1);
        }
      }
      const winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      if (winner === -1) continue; // paper → transparent
      const c = PALETTE[winner]!;
      const i = (gy * gw + gx) * 4;
      output.data[i] = c[0]; output.data[i + 1] = c[1]; output.data[i + 2] = c[2]; output.data[i + 3] = 255;
    }
  }
  keepLargestComponent(output);
  return output;
}

/** Drop fragments of captions/neighbouring sprites caught by the crop. */
function keepLargestComponent(output: InstanceType<typeof PNG>) {
  const { width: w, height: h } = output;
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] !== -1 || output.data[start * 4 + 3] === 0) continue;
    const id = sizes.length;
    const queue = [start];
    label[start] = id;
    let size = 0;
    for (let i = 0; i < queue.length; i++) {
      const index = queue[i]!;
      size++;
      const x = index % w, y = Math.floor(index / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, next = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && label[next] === -1 && output.data[next * 4 + 3] !== 0) {
          label[next] = id;
          queue.push(next);
        }
      }
    }
    sizes.push(size);
  }
  const biggest = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < w * h; i++) {
    if (label[i] !== -1 && label[i] !== biggest) output.data[i * 4 + 3] = 0;
  }
}

const source = PNG.sync.read(fs.readFileSync(SOURCE));
if (source.width !== 736 || source.height !== 736) throw new Error(`Unexpected reference dimensions: ${source.width}×${source.height}`);
fs.mkdirSync(ROOT, { recursive: true });
for (const crop of CROPS) {
  const png = extract(source, crop);
  fs.writeFileSync(path.join(ROOT, `${crop.pose}.png`), PNG.sync.write(png));
  console.log(`${crop.pose}: ${png.width}x${png.height}`);
}
console.log('Resampled Cinnamoroll to true pixel size');
