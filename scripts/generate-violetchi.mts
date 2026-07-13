/**
 * Violetchi pet frames for Pet Village.
 *
 * Traces the Tamagotchi Connection V2 sprites (scripts/reference/violetchi/,
 * from https://tamagotchi.fandom.com/wiki/Violetchi/Sprite_Gallery) and
 * colours the 1-bit art in Violetchi's canon palette: lavender body, one
 * yellow + one green flower on her head, dark-pink cheeks. Each frame is
 * upscaled 2× (14×15 → 28×30) onto the shared 32×32 pet canvas.
 *
 * Run: npx tsx scripts/generate-violetchi.mts
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const REF = path.resolve('scripts/reference/violetchi');
const OUT = path.resolve('public/assets/pet/violetchi');

type Rgba = [number, number, number, number];

const OUTLINE: Rgba = [26, 16, 38, 255]; // near-black plum
const BODY: Rgba = [207, 168, 236, 255]; // lavender
const FLOWER_L: Rgba = [255, 216, 77, 255]; // yellow flower
const FLOWER_R: Rgba = [143, 217, 104, 255]; // green flower
const CHEEK: Rgba = [232, 101, 154, 255]; // dark pink

function readRef(name: string) {
  return PNG.sync.read(fs.readFileSync(path.join(REF, name)));
}

function isInk(png: InstanceType<typeof PNG>, x: number, y: number): 'out' | 'fill' | 'none' {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return 'none';
  const i = (png.width * y + x) << 2;
  if (png.data[i + 3] < 128) return 'none';
  return png.data[i] + png.data[i + 1] + png.data[i + 2] > 380 ? 'fill' : 'out';
}

/**
 * Colour one reference frame into a { grid } of RGBA pixels.
 * The two head flowers live in the top corners (x<=3 / x>=w-4, y<=3).
 */
function colorize(png: InstanceType<typeof PNG>, opts: { cheeks?: boolean; sleepEyes?: boolean } = {}) {
  const grid: (Rgba | null)[][] = [];
  for (let y = 0; y < png.height; y++) {
    const row: (Rgba | null)[] = [];
    for (let x = 0; x < png.width; x++) {
      const kind = isInk(png, x, y);
      if (kind === 'none') {
        row.push(null);
        continue;
      }
      if (kind === 'out') {
        row.push(OUTLINE);
        continue;
      }
      const flowerRow = y <= 3;
      if (flowerRow && x <= 3) row.push(FLOWER_L);
      else if (flowerRow && x >= png.width - 4) row.push(FLOWER_R);
      else row.push(BODY);
    }
    grid.push(row);
  }
  if (opts.cheeks) {
    // Blush sits on the outer face pixels just below the eyes.
    for (const [cx, cy] of [
      [1, 7],
      [2, 7],
      [png.width - 2, 7],
      [png.width - 3, 7],
    ]) {
      if (grid[cy]?.[cx] === BODY) grid[cy]![cx] = CHEEK;
    }
  }
  if (opts.sleepEyes) {
    // Replace the open eyes (rows 5-7) with closed lids: a single dash each.
    for (let y = 5; y <= 7; y++) {
      for (let x = 1; x < png.width - 1; x++) {
        if (grid[y]?.[x] === OUTLINE) grid[y]![x] = BODY;
      }
    }
    for (const [ex0, ex1] of [
      [3, 4],
      [png.width - 5, png.width - 4],
    ]) {
      for (let x = ex0; x <= ex1; x++) {
        if (grid[6]?.[x]) grid[6]![x] = OUTLINE;
      }
    }
  }
  return grid;
}

/** Shift the feet rows sideways for a simple two-frame waddle. */
function leanFeet(grid: (Rgba | null)[][], dx: number) {
  const out = grid.map((row) => [...row]);
  for (let y = 10; y < grid.length; y++) {
    const row = grid[y]!;
    const shifted: (Rgba | null)[] = row.map(() => null);
    for (let x = 0; x < row.length; x++) {
      const nx = x + dx;
      if (row[x] && nx >= 0 && nx < row.length) shifted[nx] = row[x]!;
    }
    out[y] = shifted;
  }
  return out;
}

/** Draw the 2×-scaled grid onto a 32×32 canvas. */
function render(grid: (Rgba | null)[][], file: string, lift = 0) {
  const png = new PNG({ width: 32, height: 32 });
  png.data.fill(0);
  const w = grid[0]!.length * 2;
  const h = grid.length * 2;
  const ox = Math.floor((32 - w) / 2);
  const oy = 32 - h - lift;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y]!.length; x++) {
      const c = grid[y]![x];
      if (!c) continue;
      for (let sy = 0; sy < 2; sy++) {
        for (let sx = 0; sx < 2; sx++) {
          const px = ox + x * 2 + sx;
          const py = oy + y * 2 + sy;
          if (px < 0 || py < 0 || px >= 32 || py >= 32) continue;
          const i = (32 * py + px) << 2;
          png.data[i] = c[0];
          png.data[i + 1] = c[1];
          png.data[i + 2] = c[2];
          png.data[i + 3] = c[3];
        }
      }
    }
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, file), PNG.sync.write(png));
  console.log('wrote', path.join(OUT, file));
}

const idle1 = readRef('idle1.png');
const idle2 = readRef('idle2.png');
const happy = readRef('happy.png');
const sad = readRef('sad.png');

render(colorize(idle1, { cheeks: true }), 'neutral1.png');
render(colorize(idle2, { cheeks: true }), 'neutral2.png');
render(colorize(happy, { cheeks: true }), 'happy.png');
render(colorize(sad), 'sad.png');
render(colorize(idle1, { sleepEyes: true }), 'sleep.png');
render(colorize(happy, { cheeks: true }), 'jump.png', 3);
render(leanFeet(colorize(idle1, { cheeks: true }), -1), 'walk1.png');
render(leanFeet(colorize(idle2, { cheeks: true }), 1), 'walk2.png');
