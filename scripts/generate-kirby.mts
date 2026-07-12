/**
 * Kirby pet frames — traced from the SNES/KSSU-style reference sheet.
 *
 * Hands are body bulges with selective outline: magenta rim on the outer
 * tip, deep-pink crease underneath — never a black seam between arm and torso.
 *
 * Poses: neutral1, neutral2, walk1, walk2, sad, happy, sleep, jump.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve('public/assets/pet/kirby');
type RGBA = [number, number, number, number];
type Pose = 'neutral1' | 'neutral2' | 'walk1' | 'walk2' | 'sad' | 'happy' | 'sleep' | 'jump';
const POSES: Pose[] = ['neutral1', 'neutral2', 'walk1', 'walk2', 'sad', 'happy', 'sleep', 'jump'];

// Exact palette from https://preview.redd.it/favorite-kirby-sprite-…
const K: RGBA = [0, 0, 0, 255];
const O: RGBA = [112, 0, 88, 255];
const P: RGBA = [248, 160, 232, 255];
const S: RGBA = [240, 112, 224, 255];
const D: RGBA = [224, 64, 208, 255];
const B: RGBA = [192, 16, 176, 255];
const W: RGBA = [248, 248, 248, 255];
const G: RGBA = [48, 48, 48, 255];
const R: RGBA = [248, 16, 32, 255];
const r: RGBA = [192, 0, 0, 255];

const PAL: Record<string, RGBA> = { K, O, P, S, D, B, W, G, R, r };

/**
 * Front-facing reference sprite (27×21), including the soft black halo.
 * Codes: K black, O outline, P pink, S shade, D deep, B blush,
 * W white, G gray, R/r foot reds. `.` = empty.
 */
const FRONT: string[] = [
  '......KOBSPPPSDOK..........',
  '.....KBSPPPPPPPSDK.........',
  '....KBPPPPPPPPPPSDK........',
  '...KBPPWWPPPPPPPPSBK.......',
  '...KSPPWWPPPPPPPPPSK.......',
  '..KOPPPPPPPDPPPDPPPBK......',
  '..KDPPPPPPDKSPDKPPPSK......',
  '.KBSPPPPPPBWSPBPSPPSOK.....',
  'KOSPPPPPPPBKSPBKSPPSDK.....',
  'KSPPPPPPPPBKSPBKSPPPSOK....',
  'OPPPPPPSSPDKPPDKPSSPPBK....',
  'DPPPPPSDDSPOPPSOPDSPPDK....',
  'DPPPPPPSSPPPPPPPPPPPPDK....',
  'DPPPSSPPPPPPPPDPPPPSPBK....',
  'KDSSDDPPPPPPPPKPPPPSBGK....',
  '.KGOODSPPPPPPPPPPPSDGK.....',
  '...KKODSPPPPPPPPPSSOKK.....',
  '..KrOOGDSPPPPPPPSDOGrOK....',
  '.KrrRRrOGBDSSSDDBOOPRRK....',
  '.KrRSPSRrKOOOOGGKOrRrOK....',
  '.KOrRRRROOK..KKKKKKKKK.....',
];

function blank() {
  const png = new PNG({ width: 32, height: 32 });
  png.data.fill(0);
  return png;
}

function set(png: InstanceType<typeof PNG>, x: number, y: number, c: RGBA) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= 32 || y >= 32) return;
  const i = (32 * y + x) << 2;
  png.data[i] = c[0];
  png.data[i + 1] = c[1];
  png.data[i + 2] = c[2];
  png.data[i + 3] = c[3];
}

function getA(png: InstanceType<typeof PNG>, x: number, y: number) {
  if (x < 0 || y < 0 || x >= 32 || y >= 32) return 0;
  return png.data[((32 * y + x) << 2) + 3];
}

function getRGB(png: InstanceType<typeof PNG>, x: number, y: number): RGBA | null {
  if (x < 0 || y < 0 || x >= 32 || y >= 32) return null;
  const i = (32 * y + x) << 2;
  if (png.data[i + 3] < 200) return null;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

function eq(a: RGBA | null, b: RGBA) {
  return !!a && a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Stamp FRONT grid centered in 32×32 with optional offset. */
function stampFront(png: InstanceType<typeof PNG>, ox: number, oy: number) {
  const gw = FRONT[0]!.length;
  const gh = FRONT.length;
  const x0 = Math.floor((32 - gw) / 2) + ox;
  const y0 = Math.floor((32 - gh) / 2) + oy;
  for (let y = 0; y < gh; y++) {
    const row = FRONT[y]!;
    for (let x = 0; x < gw; x++) {
      const ch = row[x]!;
      if (ch === '.') continue;
      const col = PAL[ch];
      if (col) set(png, x0 + x, y0 + y, col);
    }
  }
  return { x0, y0, gw, gh };
}

/** Clear a rectangle (used before redrawing feet / face). */
function clear(png: InstanceType<typeof PNG>, x0: number, y0: number, x1: number, y1: number) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 0 || y < 0 || x >= 32 || y >= 32) continue;
      const i = (32 * y + x) << 2;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = png.data[i + 3] = 0;
    }
  }
}

/**
 * Raised arm nubs (happy / jump) — pink continuous with body,
 * outer O tip, deep crease on the inner underside (reference style).
 */
function raiseArms(png: InstanceType<typeof PNG>) {
  const cy = 14;
  for (const side of [-1, 1] as const) {
    const ax = 16 + side * 9;
    const ay = cy - 5;
    // Pink stub + shoulder bridge
    for (let dy = -3; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.hypot(dx / 2.1, dy / 2.8) <= 1) set(png, ax + dx, ay + dy, P);
      }
    }
    set(png, ax - 1, ay - 3, P);
    set(png, ax, ay - 3, P);
    set(png, ax + 1, ay - 3, P);
    for (let t = 0; t <= 4; t++) {
      set(png, 16 + side * (5 + t), ay + 1, P);
      set(png, 16 + side * (5 + t), ay + 2, P);
      set(png, 16 + side * (6 + t), ay, P);
    }
    // Outer tip: magenta outline + deep lower edge (selective)
    set(png, ax + side * 2, ay - 2, O);
    set(png, ax + side * 2, ay - 1, O);
    set(png, ax + side * 2, ay, O);
    set(png, ax + side * 2, ay + 1, D);
    // Inner underside crease — deep/shade, never black
    set(png, ax - side, ay + 2, D);
    set(png, ax, ay + 2, D);
    set(png, ax - side, ay + 1, S);
    // Soft black halo only on the outer rim
    for (let dy = -4; dy <= 2; dy++) {
      const hx = ax + side * 3;
      const hy = ay + dy;
      if (!getA(png, hx, hy) && getA(png, hx - side, hy)) set(png, hx, hy, K);
    }
    set(png, ax + side * 2, ay - 3, K);
    set(png, ax + side, ay - 4, K);
    set(png, ax, ay - 4, K);
  }
}

/** Replace eye pixels in the face band. */
function paintEyes(
  png: InstanceType<typeof PNG>,
  mode: 'normal' | 'happy' | 'sad' | 'sleep',
) {
  // Reference eye centers in the stamped 32×32 (FRONT origin ≈ 2.5,5.5)
  const sockets: [number, number][] = [
    [13, 13],
    [18, 13],
  ];

  // Restore pink over existing eye blacks / whites in a small window
  for (const [ex, ey] of sockets) {
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = getRGB(png, ex + dx, ey + dy);
        if (eq(c, K) || eq(c, W)) set(png, ex + dx, ey + dy, P);
      }
    }
  }

  if (mode === 'sleep') {
    for (const [ex, ey] of sockets) {
      set(png, ex - 1, ey + 1, K);
      set(png, ex, ey + 2, K);
      set(png, ex + 1, ey + 2, K);
    }
  } else if (mode === 'happy') {
    for (const [ex, ey] of sockets) {
      set(png, ex - 1, ey + 1, K);
      set(png, ex, ey, K);
      set(png, ex + 1, ey + 1, K);
    }
  } else if (mode === 'sad') {
    for (const [ex, ey] of sockets) {
      set(png, ex, ey, K);
      set(png, ex, ey + 1, K);
      set(png, ex + (ex < 16 ? -1 : 1), ey, K);
    }
  }
}

/** Shift feet horizontally for walk stride (repaint bottom band). */
function strideFeet(png: InstanceType<typeof PNG>, stride: number) {
  // Copy foot band, clear, redraw shifted
  const y0 = 22;
  const y1 = 30;
  const band: { x: number; y: number; c: RGBA }[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = 0; x < 32; x++) {
      const c = getRGB(png, x, y);
      if (!c) continue;
      if (eq(c, R) || eq(c, r) || eq(c, G) || eq(c, O) || eq(c, K) || eq(c, B) || eq(c, D) || eq(c, S)) {
        // Only move foot-ish reds; keep body pinks in band
        if (eq(c, R) || eq(c, r) || (eq(c, O) && y >= 24) || (eq(c, K) && y >= 24) || (eq(c, G) && y >= 24)) {
          band.push({ x, y, c });
        }
      }
    }
  }
  for (const p of band) {
    const i = (32 * p.y + p.x) << 2;
    png.data[i] = png.data[i + 1] = png.data[i + 2] = png.data[i + 3] = 0;
  }
  for (const p of band) {
    // Left foot (x < 16) moves with +stride, right with -stride
    const dx = p.x < 16 ? stride : -stride;
    set(png, p.x + dx, p.y, p.c);
  }
}

function save(png: InstanceType<typeof PNG>, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

function drawKirby(pose: Pose) {
  const png = blank();
  const bob = pose === 'neutral2' || pose === 'walk2' ? 1 : pose === 'jump' ? -2 : 0;
  stampFront(png, 0, bob);

  if (pose === 'happy' || pose === 'jump') {
    raiseArms(png);
    paintEyes(png, 'happy');
    // Small open smile
    set(png, 15, 17, K);
    set(png, 16, 17, B);
    set(png, 17, 17, K);
    set(png, 16, 18, B);
  } else if (pose === 'sad') {
    paintEyes(png, 'sad');
    set(png, 15, 18, K);
    set(png, 16, 17, K);
    set(png, 17, 18, K);
  } else if (pose === 'sleep') {
    paintEyes(png, 'sleep');
    // Soft Z hint — keep mouth as stamped / cleared
    clear(png, 15, 16, 17, 18);
    set(png, 15, 17, P);
    set(png, 16, 17, P);
    set(png, 17, 17, P);
  }

  if (pose === 'walk1') strideFeet(png, 2);
  if (pose === 'walk2') strideFeet(png, -2);
  if (pose === 'jump') strideFeet(png, 0); // feet already closer via stamp; tuck slightly
  if (pose === 'jump') {
    // Pull feet closer under body
    strideFeet(png, 1);
  }

  return png;
}

for (const pose of POSES) {
  save(drawKirby(pose), path.join(ROOT, `${pose}.png`));
}
console.log('Wrote Kirby pet frames from reference sheet');
