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
import { repairExternalOutline } from './lib/pixel-outline.mjs';

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
  [0, 0, 0, 255], // outline (true black)
  [255, 255, 247, 255], // fur
  [193, 234, 240, 255], // light cyan shading
  [86, 164, 214, 255], // sky-blue eyes (calibrated from the sheet)
  [246, 168, 178, 255], // blush
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
  // Saturated sky-blue = open eyes (calibrated anchor from the sheet)
  if (Math.hypot(r - 72, g - 168, b - 216) < 70 && b - r > 60) return 3;
  // Warm pink = blush
  if (r > 200 && r - b > 25 && g < 215) return 4;
  if (brightness < 132) return 0; // outline (incl. anti-aliased edge grays)
  // Pale cyan shading; neutral grays already fell into the outline bucket
  if (b > r + 22 && g > r + 14) return 2;
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
      let winner = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      // Eye/blush source pixels are erased here; the face is stamped
      // deterministically afterwards so features sit exactly where the
      // reference has them.
      if (winner === 3 || winner === 4) winner = 1;
      if (winner === -1) continue; // paper → transparent
      const c = PALETTE[winner]!;
      const i = (gy * gw + gx) * 4;
      output.data[i] = c[0]; output.data[i + 1] = c[1]; output.data[i + 2] = c[2]; output.data[i + 3] = 255;
    }
  }
  keepLargestComponent(output);
  fillInterior(output);
  borderize(output);
  closeOutlineGaps(output);
  fillInterior(output); // gaps sealed — nothing inside stays see-through
  // Skip thinOutline — it was peeling feet/ear edges and leaving incomplete outlines.
  stampFace(crop.pose, output);
  // Re-seal silhouette after face stamps so mouth/eyes never punch holes in the rim.
  borderize(output);
  closeOutlineGaps(output);
  hardenOutline(output);
  return output;
}

/** Force every silhouette-edge cell to pure black (no leftover AA gray). */
function hardenOutline(output: InstanceType<typeof PNG>) {
  const { width: w, height: h } = output;
  const dark = PALETTE[0]!;
  const outside = outsideMask(output);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (output.data[i + 3] === 0) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || outside[ny * w + nx]) {
          output.data[i] = dark[0];
          output.data[i + 1] = dark[1];
          output.data[i + 2] = dark[2];
          output.data[i + 3] = 255;
          break;
        }
      }
    }
  }
}

/** Transparent cells reachable from the border (the true outside). */
function outsideMask(output: InstanceType<typeof PNG>) {
  const { width: w, height: h } = output;
  const outside = new Uint8Array(w * h);
  const queue: number[] = [];
  const add = (x: number, y: number) => {
    const i = y * w + x;
    if (!outside[i] && output.data[i * 4 + 3] === 0) { outside[i] = 1; queue.push(i); }
  };
  for (let x = 0; x < w; x++) { add(x, 0); add(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { add(0, y); add(w - 1, y); }
  for (let i = 0; i < queue.length; i++) {
    const x = queue[i]! % w, y = Math.floor(queue[i]! / w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) add(nx, ny);
    }
  }
  return outside;
}

function isOutlinePixel(data: Buffer, i: number, dark: RGBA) {
  return data[i + 3] !== 0 && data[i] === dark[0] && data[i + 1] === dark[1] && data[i + 2] === dark[2];
}

/**
 * The silhouette boundary must be black outline: any non-dark cell that
 * touches the outside becomes outline (never deleted — deleting would
 * open see-through notches into the body).
 */
function borderize(output: InstanceType<typeof PNG>) {
  const { width: w, height: h } = output;
  const dark = PALETTE[0]!;
  const outside = outsideMask(output);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (output.data[i + 3] === 0 || isOutlinePixel(output.data, i, dark)) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || outside[ny * w + nx]) {
        output.data[i] = dark[0]; output.data[i + 1] = dark[1]; output.data[i + 2] = dark[2];
        break;
      }
    }
  }
}

/** Bridge 1-cell breaks in the outline so the interior can't leak out. */
function closeOutlineGaps(output: InstanceType<typeof PNG>) {
  const { width: w, height: h } = output;
  const dark = PALETTE[0]!;
  for (let pass = 0; pass < 2; pass++) {
    const add: number[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (output.data[i + 3] !== 0) continue;
      let darkNeighbours = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = (ny * w + nx) * 4;
        if (isOutlinePixel(output.data, n, dark)) darkNeighbours++;
      }
      if (darkNeighbours >= 4) add.push(i);
    }
    for (const i of add) { output.data[i] = dark[0]; output.data[i + 1] = dark[1]; output.data[i + 2] = dark[2]; output.data[i + 3] = 255; }
  }
}

/** Transparent cells NOT reachable from the border are interior: make them fur. */
/**
 * Where borderize doubled the outline (dark cell touching outside whose
 * every opaque neighbour is also dark), peel the outer layer back to a
 * single-cell line. Single pass against a fixed mask.
 */
function thinOutline(output: InstanceType<typeof PNG>) {
  const { width: w, height: h } = output;
  const dark = PALETTE[0]!;
  const outside = outsideMask(output);
  const remove: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (!isOutlinePixel(output.data, i, dark)) continue;
    let touchesOutside = false;
    let exposesSoft = false;
    let hasInnerDark = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy;
      const orth = dx === 0 || dy === 0;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || outside[ny * w + nx]) {
        if (orth) touchesOutside = true;
        continue;
      }
      const n = (ny * w + nx) * 4;
      if (output.data[n + 3] === 0) continue;
      if (!isOutlinePixel(output.data, n, dark)) exposesSoft = true;
      else if (orth) hasInnerDark = true;
    }
    if (touchesOutside && !exposesSoft && hasInnerDark) remove.push(i);
  }
  for (const i of remove) output.data[i + 3] = 0;
}

function fillInterior(output: InstanceType<typeof PNG>) {
  const { width: w, height: h } = output;
  const outside = outsideMask(output);
  const fur = PALETTE[1]!;
  for (let i = 0; i < w * h; i++) {
    if (output.data[i * 4 + 3] === 0 && !outside[i]) {
      output.data[i * 4] = fur[0]; output.data[i * 4 + 1] = fur[1]; output.data[i * 4 + 2] = fur[2]; output.data[i * 4 + 3] = 255;
    }
  }
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

type Face = {
  /** Sky-blue eye rectangles (win-pose has just one open eye). */
  eyes?: { x: number; y: number; w: number; h: number }[];
  /** Blush cells under the eyes. */
  blush?: { y: number; lx: number; rx: number; w: number };
  /** Dark mouth cells. */
  mouth?: [number, number][];
};

// Eye rectangles are placed at the cells where the reference's saturated
// eye-blue actually lands (measured per pose on the 7px grid).
// Mouth cells match the sheet: small “v” (or two dots) centered between the
// eyes, on/just below the blush row — not a lower connected bar.
const FACES: Record<Pose, Face> = {
  idle: {
    eyes: [{ x: 10, y: 6, w: 2, h: 3 }, { x: 18, y: 6, w: 2, h: 3 }],
    blush: { y: 10, lx: 8, rx: 19, w: 2 },
    // Reference: dots at (13,10)&(16,10); tip one row down → small “v”
    mouth: [
      [13, 10],
      [16, 10],
      [14, 11],
      [15, 11],
    ],
  },
  walk1: {
    eyes: [{ x: 10, y: 6, w: 2, h: 3 }, { x: 18, y: 6, w: 2, h: 3 }],
    blush: { y: 11, lx: 9, rx: 19, w: 2 },
    // Measured on sheet: (14,10) (16,10) (15,11)
    mouth: [
      [14, 10],
      [16, 10],
      [15, 11],
    ],
  },
  walk2: {
    eyes: [{ x: 9, y: 6, w: 2, h: 3 }, { x: 18, y: 6, w: 2, h: 3 }],
    blush: { y: 10, lx: 8, rx: 19, w: 2 },
    // Measured: (14,10) (15,10) — extend to a tiny “v”
    mouth: [
      [13, 10],
      [16, 10],
      [14, 11],
      [15, 11],
    ],
  },
  jump: {
    eyes: [{ x: 10, y: 6, w: 2, h: 3 }, { x: 18, y: 6, w: 2, h: 3 }],
    blush: { y: 10, lx: 9, rx: 19, w: 2 },
    // Measured: (14,9) (16,9) (15,10)
    mouth: [
      [14, 9],
      [16, 9],
      [15, 10],
    ],
  },
  // sad keeps its natural closed-eye marks from the sheet; frown “^”
  sad: {
    blush: { y: 10, lx: 11, rx: 19, w: 2 },
    mouth: [
      [14, 11],
      [15, 10],
      [16, 11],
    ],
  },
  // WIN/POSE: open left eye, closed right wink. Mouth centred like idle
  // (idle mouth lands at pet x 16–19; happy pad is +1 vs idle, so frame −1).
  happy: {
    eyes: [{ x: 4, y: 6, w: 2, h: 3 }],
    blush: { y: 9, lx: 6, rx: 19, w: 2 },
    // Open smile aligned to default mouth middle (pet ~16–19).
    mouth: [
      [12, 10],
      [15, 10],
      [11, 11],
      [16, 11],
      [12, 12],
      [13, 12],
      [14, 12],
      [15, 12],
    ],
  },
};

function stampFace(pose: Pose, output: InstanceType<typeof PNG>) {
  const face = FACES[pose];
  const fur = PALETTE[1]!;
  const dark = PALETTE[0]!;
  const put = (x: number, y: number, c: RGBA) => {
    const i = (y * output.width + x) * 4;
    if (output.data[i + 3] === 0) return; // never paint outside the body
    output.data[i] = c[0]; output.data[i + 1] = c[1]; output.data[i + 2] = c[2]; output.data[i + 3] = 255;
  };
  const isDark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= output.width || y >= output.height) return false;
    const i = (y * output.width + x) * 4;
    return isOutlinePixel(output.data, i, dark);
  };
  const isInterior = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= output.width || y >= output.height) return false;
    const i = (y * output.width + x) * 4;
    if (output.data[i + 3] === 0) return false;
    // Interior if all 4-neighbours are opaque (not on the silhouette rim).
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= output.width || ny >= output.height) return false;
      if (output.data[(ny * output.width + nx) * 4 + 3] === 0) return false;
    }
    return true;
  };

  for (const eye of face.eyes ?? []) {
    for (let dy = 0; dy < eye.h; dy++) for (let dx = 0; dx < eye.w; dx++) {
      put(eye.x + dx, eye.y + dy, PALETTE[3]!);
    }
  }
  if (face.blush) {
    const { y, lx, rx, w } = face.blush;
    for (let dx = 0; dx < w; dx++) {
      put(lx + dx, y, PALETTE[4]!);
      put(rx + dx, y, PALETTE[4]!);
    }
  }

  // Clear stray dark face-dots on the blush row (sheet compression orphans),
  // then stamp the measured mouth. Mouth cells on this row are re-painted after.
  if (face.blush) {
    const y = face.blush.y;
    const x0 = face.blush.lx + face.blush.w;
    const x1 = face.blush.rx - 1;
    const mouthOnRow = new Set(
      (face.mouth ?? []).filter(([, my]) => my === y).map(([mx]) => mx),
    );
    for (let x = x0; x <= x1; x++) {
      if (mouthOnRow.has(x)) continue;
      if (!isDark(x, y)) continue;
      // Keep true outline edge cells; only clear interior face dots.
      const edge = !isDark(x - 1, y) || !isDark(x + 1, y);
      if (edge) put(x, y, fur);
    }
  }

  // Happy WIN/POSE: clear a face-mouth band of interior dark noise (sheet
  // compression leaves broken bars / blue crumbs), then stamp a clean open smile.
  if (pose === 'happy') {
    for (let y = 9; y <= 13; y++) {
      for (let x = 9; x <= 18; x++) {
        if (!isInterior(x, y)) continue;
        if (isDark(x, y)) put(x, y, fur);
        // Also clear cyan shading crumbs that read as a broken mouth
        const i = (y * output.width + x) * 4;
        const r = output.data[i]!;
        const g = output.data[i + 1]!;
        const b = output.data[i + 2]!;
        if (b > r + 20 && g > r + 10 && b < 250) put(x, y, fur);
      }
    }
    // Right-eye wink arc (closed lid) — two-row soft curve, no blue leftover.
    for (const [x, y] of [
      [12, 7],
      [13, 7],
      [14, 7],
      [11, 8],
      [15, 8],
    ] as [number, number][]) {
      put(x, y, dark);
    }
    // Pink tongue — same horizontal middle as idle mouth (pet x 16–19).
    for (const [x, y] of [
      [12, 11],
      [13, 11],
      [14, 11],
      [15, 11],
    ] as [number, number][]) {
      put(x, y, PALETTE[4]!);
    }
    // Clear any leftover dark crumbs just above the smile
    for (const [x, y] of [
      [12, 9],
      [13, 9],
      [14, 9],
      [15, 9],
    ] as [number, number][]) {
      if (isInterior(x, y)) put(x, y, fur);
    }
  }

  for (const [x, y] of face.mouth ?? []) put(x, y, dark);
}

/** Paste a frame onto a 32x32 canvas, bottom-centred like the other pets. */
function padToPet(frame: InstanceType<typeof PNG>, bob = 0) {
  const out = new PNG({ width: 32, height: 32 });
  out.data.fill(0);
  const x0 = Math.floor((32 - frame.width) / 2);
  const y0 = 30 - frame.height + bob;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      const i = (y * frame.width + x) * 4;
      if (frame.data[i + 3] === 0) continue;
      const o = ((y0 + y) * 32 + (x0 + x)) * 4;
      out.data[o] = frame.data[i]; out.data[o + 1] = frame.data[i + 1];
      out.data[o + 2] = frame.data[i + 2]; out.data[o + 3] = 255;
    }
  }
  return out;
}

/** Sleep frame: the idle pose with the blue eyes swapped for closed lids. */
function makeSleep(idle: InstanceType<typeof PNG>) {
  const out = new PNG({ width: idle.width, height: idle.height });
  idle.data.copy(out.data);
  const fur = PALETTE[1]!;
  const dark = PALETTE[0]!;
  for (const eye of FACES.idle.eyes ?? []) {
    for (let dy = 0; dy < eye.h; dy++) for (let dx = 0; dx < eye.w; dx++) {
      const i = ((eye.y + dy) * idle.width + (eye.x + dx)) * 4;
      const closed = dy === eye.h - 1;
      const c = closed ? dark : fur;
      out.data[i] = c[0]; out.data[i + 1] = c[1]; out.data[i + 2] = c[2]; out.data[i + 3] = 255;
    }
  }
  return out;
}

const source = PNG.sync.read(fs.readFileSync(SOURCE));
if (source.width !== 736 || source.height !== 736) throw new Error(`Unexpected reference dimensions: ${source.width}×${source.height}`);
fs.mkdirSync(ROOT, { recursive: true });
const frames = new Map<Pose, InstanceType<typeof PNG>>();
for (const crop of CROPS) {
  const png = extract(source, crop);
  frames.set(crop.pose, png);
  fs.writeFileSync(path.join(ROOT, `${crop.pose}.png`), PNG.sync.write(repairExternalOutline(png)));
  console.log(`${crop.pose}: ${png.width}x${png.height}`);
}
console.log('Resampled Cinnamoroll to true pixel size');

// Pet frames: same art, padded to the 32x32 pet canvas. neutral2 bobs one
// pixel for the bounce animation; sleep closes the idle pose's eyes.
const PET_ROOT = path.resolve('public/assets/pet/cinnamoroll');
fs.mkdirSync(PET_ROOT, { recursive: true });
const idle = frames.get('idle')!;
const petFrames: Record<string, InstanceType<typeof PNG>> = {
  neutral1: padToPet(idle),
  neutral2: padToPet(idle, 1),
  walk1: padToPet(frames.get('walk1')!),
  walk2: padToPet(frames.get('walk2')!),
  sad: padToPet(frames.get('sad')!),
  happy: padToPet(frames.get('happy')!),
  jump: padToPet(frames.get('jump')!, -2),
  sleep: padToPet(makeSleep(idle)),
};
for (const [name, png] of Object.entries(petFrames)) {
  fs.writeFileSync(path.join(PET_ROOT, `${name}.png`), PNG.sync.write(repairExternalOutline(png)));
}
console.log('Wrote Cinnamoroll pet frames (32x32)');
