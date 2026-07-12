/**
 * Cinnamoroll animation frames traced from the supplied reference sheet.
 *
 * Frames are intentionally drawn at native 32px: a warm-white chibi body,
 * long floppy ears, one-pixel charcoal outline, blue eyes/shadows and blush.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve('public/assets/npc/cinnamoroll');
const W = 32;
const H = 32;
type RGBA = [number, number, number, number];

const PAL: Record<string, RGBA> = {
  k: [35, 42, 43, 255], // reference's soft charcoal, never pure black
  w: [255, 254, 246, 255],
  s: [190, 231, 240, 255],
  e: [76, 170, 210, 255],
  p: [248, 181, 181, 255],
};

type Pt = [number, number];
type Pose = 'idle' | 'walk1' | 'walk2' | 'jump' | 'sad' | 'happy';

function insidePolygon(x: number, y: number, points: Pt[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function makeMask(pose: Pose) {
  const mask = Array.from({ length: H }, () => Array<boolean>(W).fill(false));
  const add = (points: Pt[]) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (insidePolygon(x + 0.5, y + 0.5, points)) mask[y]![x] = true;
  };
  const box = (x: number, y: number, width: number, height: number) => add([[x, y], [x + width, y], [x + width, y + height], [x, y + height]]);

  // The source's defining silhouette: round head + very long horizontal ears.
  const airborne = pose === 'jump' || pose === 'happy';
  const y = airborne ? 3 : pose === 'sad' ? 6 : 5;
  add([[9, y], [18, y], [21, y + 2], [22, y + 5], [21, y + 10], [18, y + 12], [9, y + 12], [6, y + 10], [5, y + 6], [6, y + 2]]);

  if (pose === 'jump') {
    add([[6, y + 5], [2, y + 7], [1, y + 10], [3, y + 12], [7, y + 11], [10, y + 8], [10, y + 5]]);
    add([[21, y + 5], [26, y + 6], [29, y + 9], [29, y + 12], [27, y + 13], [23, y + 11], [20, y + 8]]);
  } else if (pose === 'happy') {
    // Wing/celebration pose from the reference sheet.
    add([[7, y + 6], [3, y + 5], [1, y + 7], [2, y + 10], [6, y + 11], [10, y + 9]]);
    add([[20, y + 5], [25, y + 2], [29, y + 4], [29, y + 7], [25, y + 8], [21, y + 10]]);
  } else {
    add([[7, y + 6], [3, y + 8], [1, y + 11], [2, y + 13], [5, y + 13], [9, y + 10], [10, y + 7]]);
    add([[20, y + 6], [25, y + 7], [28, y + 10], [28, y + 13], [25, y + 14], [21, y + 11], [20, y + 8]]);
  }

  // Compact body and two feet; walking alternates the leading foot.
  const bodyY = y + 11;
  add([[10, bodyY], [19, bodyY], [20, bodyY + 4], [19, bodyY + 8], [16, bodyY + 9], [15, bodyY + 8], [13, bodyY + 9], [10, bodyY + 8], [9, bodyY + 4]]);
  if (pose === 'walk1') box(8, bodyY + 7, 5, 3);
  if (pose === 'walk2') box(17, bodyY + 7, 5, 3);
  if (pose === 'jump') { box(10, bodyY + 8, 4, 2); box(16, bodyY + 8, 4, 2); }
  return mask;
}

function set(px: InstanceType<typeof PNG>, x: number, y: number, color: RGBA) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) << 2;
  px.data[i] = color[0]; px.data[i + 1] = color[1]; px.data[i + 2] = color[2]; px.data[i + 3] = color[3];
}

function draw(pose: Pose) {
  const png = new PNG({ width: W, height: H });
  png.data.fill(0);
  const mask = makeMask(pose);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y]![x]) set(png, x, y, PAL.w);
  // One-pixel exterior outline, matching the heavy reference contour.
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!mask[y]![x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !mask[y + dy]?.[x + dx])) set(png, x, y, PAL.k);
  }

  const y = pose === 'jump' || pose === 'happy' ? 3 : pose === 'sad' ? 6 : 5;
  // Pale-blue underside strips on the floppy ears and body hem.
  for (const [x, yy] of [[3, y + 11], [4, y + 12], [5, y + 12], [22, y + 12], [23, y + 13], [24, y + 13], [11, y + 18], [12, y + 18], [17, y + 18], [18, y + 18]] as Pt[]) set(png, x, yy, PAL.s);
  // Eyes, cheeks and tiny mouth sit on a consistent face plane across animation frames.
  if (pose === 'sad') {
    set(png, 11, y + 7, PAL.e); set(png, 18, y + 7, PAL.e);
    set(png, 14, y + 10, PAL.k); set(png, 15, y + 10, PAL.k); set(png, 16, y + 10, PAL.k);
  } else if (pose === 'happy') {
    set(png, 11, y + 7, PAL.k); set(png, 12, y + 8, PAL.k);
    set(png, 18, y + 7, PAL.e); set(png, 18, y + 8, PAL.e);
    set(png, 15, y + 10, PAL.k); set(png, 16, y + 10, PAL.k);
  } else {
    for (const x of [11, 12, 18, 19]) { set(png, x, y + 6, PAL.e); set(png, x, y + 7, PAL.e); }
    set(png, 14, y + 10, PAL.k); set(png, 16, y + 10, PAL.k); set(png, 15, y + 11, PAL.k);
  }
  set(png, 8, y + 9, PAL.p); set(png, 9, y + 9, PAL.p); set(png, 21, y + 9, PAL.p); set(png, 22, y + 9, PAL.p);
  return png;
}

fs.mkdirSync(ROOT, { recursive: true });
for (const pose of ['idle', 'walk1', 'walk2', 'jump', 'sad', 'happy'] as Pose[]) {
  fs.writeFileSync(path.join(ROOT, `${pose}.png`), PNG.sync.write(draw(pose)));
}
console.log('Generated Cinnamoroll sprites from the supplied reference silhouette');
