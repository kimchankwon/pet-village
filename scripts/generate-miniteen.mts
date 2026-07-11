/**
 * Generates the 13 MINITEEN villager NPC sprites (SEVENTEEN's official
 * mini characters, per kprofiles.com/miniteen-seventeen-members-profile):
 *   CHOITCHERRY white rabbit (cherry tail) · JJONGTORAM squirrel in a pink
 *   bunny suit · SHUASUMI deer · O.C.L cat · TAMTAM orange tiger ·
 *   FOXDUNGEE purple six-tailed fox · PPYOPULI steamed-rice ball · DOA
 *   puppy · KIMJA potato · THEpalee princely frog · BBOOGYULI tangerine ·
 *   NONVER human in a polar-bear hood · CHANDALEE otter.
 * Poses match the other NPCs: idle, walk1, walk2, happy, sad, jump.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { PNG } = require('pngjs');

const ROOT = path.resolve('public/assets/npc/miniteen');

type RGBA = [number, number, number, number];
type Pose = 'idle' | 'walk1' | 'walk2' | 'happy' | 'sad' | 'jump';
const POSES: Pose[] = ['idle', 'walk1', 'walk2', 'happy', 'sad', 'jump'];

function blank(w = 32, h = 32) {
  const png = new PNG({ width: w, height: h });
  png.data.fill(0);
  return png;
}

function set(png: InstanceType<typeof PNG>, x: number, y: number, rgba: RGBA) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = rgba[0];
  png.data[i + 1] = rgba[1];
  png.data[i + 2] = rgba[2];
  png.data[i + 3] = rgba[3];
}

function fill(png: InstanceType<typeof PNG>, x0: number, y0: number, x1: number, y1: number, rgba: RGBA) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(png, x, y, rgba);
}

function circle(png: InstanceType<typeof PNG>, cx: number, cy: number, r: number, rgba: RGBA, outline?: RGBA) {
  for (let y = -r - 1; y <= r + 1; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = Math.hypot(x, y);
      if (d <= r - 0.6) set(png, cx + x, cy + y, rgba);
      else if (outline && d <= r + 0.4) set(png, cx + x, cy + y, outline);
    }
  }
}

function ellipse(
  png: InstanceType<typeof PNG>,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rgba: RGBA,
  outline?: RGBA,
) {
  for (let y = -ry - 1; y <= ry + 1; y++) {
    for (let x = -rx - 1; x <= rx + 1; x++) {
      const d = Math.hypot(x / rx, y / ry);
      if (d <= 1 - 0.08) set(png, cx + x, cy + y, rgba);
      else if (outline && d <= 1 + 0.06) set(png, cx + x, cy + y, outline);
    }
  }
}

function save(png: InstanceType<typeof PNG>, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

const OUT: RGBA = [30, 30, 40, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const BLUSH: RGBA = [255, 170, 190, 255];

interface Frame {
  png: InstanceType<typeof PNG>;
  pose: Pose;
  /** body centre */
  cx: number;
  cy: number;
  foot: number; // walk foot shuffle offset
}

function frame(pose: Pose): Frame {
  const png = blank();
  const cy = pose === 'jump' ? 14 : pose === 'walk2' ? 18 : 17;
  const foot = pose === 'walk1' ? -2 : pose === 'walk2' ? 2 : 0;
  return { png, pose, cx: 16, cy, foot };
}

/** Standard eyes: dots normally, ^^ when happy, slanted when sad. */
function eyes(f: Frame, dx = 4, dy = -2, ink: RGBA = OUT) {
  const { png, pose, cx, cy } = f;
  const y = cy + dy;
  if (pose === 'happy') {
    set(png, cx - dx - 1, y, ink);
    set(png, cx - dx, y - 1, ink);
    set(png, cx - dx + 1, y, ink);
    set(png, cx + dx - 1, y, ink);
    set(png, cx + dx, y - 1, ink);
    set(png, cx + dx + 1, y, ink);
  } else if (pose === 'sad') {
    set(png, cx - dx - 1, y - 1, ink);
    set(png, cx - dx, y, ink);
    set(png, cx + dx, y, ink);
    set(png, cx + dx + 1, y - 1, ink);
  } else {
    set(png, cx - dx, y, ink);
    set(png, cx - dx + 1, y, ink);
    set(png, cx + dx - 1, y, ink);
    set(png, cx + dx, y, ink);
  }
}

function mouth(f: Frame, dy = 2, ink: RGBA = OUT) {
  const { png, pose, cx, cy } = f;
  if (pose === 'sad') {
    set(png, cx - 1, cy + dy + 1, ink);
    set(png, cx, cy + dy, ink);
    set(png, cx + 1, cy + dy + 1, ink);
  } else {
    set(png, cx - 1, cy + dy, ink);
    set(png, cx, cy + dy + 1, ink);
    set(png, cx + 1, cy + dy, ink);
  }
}

function cheeks(f: Frame, dx = 6, dy = 1, color: RGBA = BLUSH) {
  const { png, cx, cy } = f;
  set(png, cx - dx, cy + dy, color);
  set(png, cx - dx + 1, cy + dy, color);
  set(png, cx + dx - 1, cy + dy, color);
  set(png, cx + dx, cy + dy, color);
}

function feet(f: Frame, color: RGBA) {
  const { png, cx, cy, foot } = f;
  fill(png, cx - 5 + foot, cy + 7, cx - 2 + foot, cy + 8, color);
  fill(png, cx + 2 - foot, cy + 7, cx + 5 - foot, cy + 8, color);
}

// ---------------------------------------------------------------- characters

const draw: Record<string, (pose: Pose) => InstanceType<typeof PNG>> = {
  // S.Coups — white rabbit, sharp brows, cherry-shaped tail.
  choitcherry(pose) {
    const f = frame(pose);
    const { png, cx, cy } = f;
    const earLift = pose === 'jump' || pose === 'happy' ? -2 : pose === 'sad' ? 2 : 0;
    const PINK_IN: RGBA = [255, 190, 205, 255];
    for (const side of [-5, 3]) {
      fill(png, cx + side, cy - 16 + earLift, cx + side + 2, cy - 7 + earLift, WHITE);
      fill(png, cx + side + 1, cy - 13 + earLift, cx + side + 1, cy - 10 + earLift, PINK_IN);
      for (let y = cy - 16 + earLift; y <= cy - 8 + earLift; y++) {
        set(png, cx + side - 1, y, OUT);
        set(png, cx + side + 3, y, OUT);
      }
      for (let x = cx + side - 1; x <= cx + side + 3; x++) set(png, x, cy - 17 + earLift, OUT);
    }
    circle(png, cx, cy, 8, WHITE, OUT);
    // Sharp brows
    set(png, cx - 5, cy - 5, OUT);
    set(png, cx - 4, cy - 4, OUT);
    set(png, cx + 4, cy - 4, OUT);
    set(png, cx + 5, cy - 5, OUT);
    eyes(f);
    mouth(f);
    cheeks(f);
    // Cherry tail: two red balls + stem, at the right side
    const RED: RGBA = [220, 50, 70, 255];
    circle(png, cx + 9, cy + 4, 1, RED, OUT);
    circle(png, cx + 11, cy + 6, 1, RED, OUT);
    set(png, cx + 10, cy + 2, [90, 140, 60, 255]);
    feet(f, WHITE);
    return png;
  },

  // Jeonghan — squirrel wearing a pink bunny costume, fluffy brown tail.
  jjongtoram(pose) {
    const f = frame(pose);
    const { png, cx, cy } = f;
    const PINK: RGBA = [250, 175, 200, 255];
    const CREAM: RGBA = [255, 240, 220, 255];
    const BROWN: RGBA = [165, 115, 70, 255];
    const earLift = pose === 'jump' || pose === 'happy' ? -2 : pose === 'sad' ? 1 : 0;
    // Floppy pink bunny-hood ears
    for (const side of [-6, 4]) {
      fill(png, cx + side, cy - 14 + earLift, cx + side + 2, cy - 7 + earLift, PINK);
      set(png, cx + side + 1, cy - 11 + earLift, CREAM);
    }
    // Fluffy squirrel tail peeking out
    circle(png, cx + 10, cy + 1, 3, BROWN, OUT);
    circle(png, cx + 9, cy - 2, 2, BROWN);
    circle(png, cx, cy, 8, PINK, OUT); // costume body
    circle(png, cx, cy - 1, 5, CREAM); // face opening
    eyes(f, 3);
    mouth(f);
    cheeks(f, 5);
    feet(f, PINK);
    return png;
  },

  // Joshua — gentle deer with little antlers; squeaky clean.
  shuasumi(pose) {
    const f = frame(pose);
    const { png, cx, cy } = f;
    const FAWN: RGBA = [225, 185, 140, 255];
    const DARK: RGBA = [150, 105, 60, 255];
    const lift = pose === 'jump' ? -2 : 0;
    // Antlers
    for (const s of [-1, 1]) {
      const ax = cx + s * 5;
      fill(png, ax, cy - 14 + lift, ax, cy - 9 + lift, DARK);
      set(png, ax + s, cy - 12 + lift, DARK);
      set(png, ax + s * 2, cy - 13 + lift, DARK);
    }
    // Small ears
    ellipse(png, cx - 7, cy - 7 + lift, 2, 1, FAWN, OUT);
    ellipse(png, cx + 7, cy - 7 + lift, 2, 1, FAWN, OUT);
    circle(png, cx, cy, 8, FAWN, OUT);
    // Back spots
    set(png, cx - 3, cy - 6, WHITE);
    set(png, cx + 2, cy - 7, WHITE);
    set(png, cx + 5, cy - 4, WHITE);
    eyes(f);
    mouth(f);
    cheeks(f);
    feet(f, FAWN);
    return png;
  },

  // Jun — mysterious cat (Open, Close & Lock are triplets; one greets town).
  ocl(pose) {
    const f = frame(pose);
    const { png, cx, cy } = f;
    const GRAY: RGBA = [120, 125, 145, 255];
    const lift = pose === 'jump' || pose === 'happy' ? -1 : 0;
    // Pointy ears
    for (const s of [-1, 1]) {
      const ex = cx + s * 5;
      set(png, ex, cy - 12 + lift, OUT);
      set(png, ex, cy - 11 + lift, GRAY);
      fill(png, ex - 1, cy - 10 + lift, ex + 1, cy - 8 + lift, GRAY);
      fill(png, ex - 2, cy - 7 + lift, ex + 2, cy - 6 + lift, GRAY);
    }
    circle(png, cx, cy, 8, WHITE, OUT);
    // Gray patch over one eye + curled tail
    fill(png, cx + 2, cy - 6, cx + 6, cy - 3, GRAY);
    set(png, cx + 10, cy + 3, GRAY);
    set(png, cx + 11, cy + 2, GRAY);
    set(png, cx + 11, cy + 1, GRAY);
    set(png, cx + 10, cy, GRAY);
    eyes(f);
    // Cat mouth: little w
    set(png, cx - 1, cy + 3, OUT);
    set(png, cx, cy + 2, OUT);
    set(png, cx + 1, cy + 3, OUT);
    // Whiskers
    set(png, cx - 8, cy + 1, OUT);
    set(png, cx + 8, cy + 1, OUT);
    feet(f, WHITE);
    return png;
  },

  // Hoshi — lucky orange tiger with a cute tummy. Horanghae!
  tamtam(pose) {
    const f = frame(pose);
    const { png, cx, cy } = f;
    const ORANGE: RGBA = [245, 150, 60, 255];
    const STRIPE: RGBA = [120, 70, 25, 255];
    const lift = pose === 'jump' || pose === 'happy' ? -1 : 0;
    circle(png, cx - 6, cy - 7 + lift, 2, ORANGE, OUT);
    circle(png, cx + 6, cy - 7 + lift, 2, ORANGE, OUT);
    circle(png, cx, cy, 8, ORANGE, OUT);
    // Cute white tummy
    ellipse(png, cx, cy + 4, 4, 3, WHITE);
    // Head stripes
    set(png, cx, cy - 7, STRIPE);
    set(png, cx, cy - 6, STRIPE);
    set(png, cx - 2, cy - 7, STRIPE);
    set(png, cx + 2, cy - 7, STRIPE);
    // Side stripes
    fill(png, cx - 8, cy - 1, cx - 7, cy - 1, STRIPE);
    fill(png, cx + 7, cy - 1, cx + 8, cy - 1, STRIPE);
    eyes(f);
    mouth(f);
    cheeks(f);
    feet(f, ORANGE);
    return png;
  },

  // Wonwoo — curious purple fox with six tails.
  foxdungee(pose) {
    const f = frame(pose);
    const { png, cx, cy } = f;
    const PURPLE: RGBA = [165, 110, 220, 255];
    const LILAC: RGBA = [210, 180, 245, 255];
    const lift = pose === 'jump' || pose === 'happy' ? -2 : 0; // ears perk up
    // Six tails fanned behind
    const tails = [
      [-11, 2], [-9, -2], [-5, -5],
      [11, 2], [9, -2], [5, -5],
    ];
    for (const [tx, ty] of tails) {
      ellipse(png, cx + tx, cy + ty, 2, 3, PURPLE, OUT);
      set(png, cx + tx, cy + ty - 2, LILAC);
    }
    // Pointy ears
    for (const s of [-1, 1]) {
      const ex = cx + s * 5;
      set(png, ex, cy - 12 + lift, OUT);
      set(png, ex, cy - 11 + lift, PURPLE);
      fill(png, ex - 1, cy - 10 + lift, ex + 1, cy - 8 + lift, PURPLE);
    }
    circle(png, cx, cy, 8, PURPLE, OUT);
    ellipse(png, cx, cy + 2, 4, 3, LILAC); // muzzle
    // White eye whites so the eyes read against the purple fur
    if (pose !== 'happy' && pose !== 'sad') {
      fill(png, cx - 5, cy - 3, cx - 3, cy - 1, WHITE);
      fill(png, cx + 3, cy - 3, cx + 5, cy - 1, WHITE);
    }
    eyes(f);
    set(png, cx, cy + 1, OUT); // nose
    feet(f, PURPLE);
    return png;
  },

  // Woozi — steamed-rice ball whose colour shifts with mood.
  ppyopuli(pose) {
    const f = frame(pose);
    const { png, pose: p, cx, cy } = f;
    // Colour follows the mood, per the character bio
    const body: RGBA = p === 'happy' ? [255, 240, 245, 255] : p === 'sad' ? [225, 230, 245, 255] : [250, 250, 250, 255];
    // Rice-mound: dome over a flat base
    circle(png, cx, cy - 1, 7, body, OUT);
    fill(png, cx - 7, cy + 1, cx + 7, cy + 6, body);
    for (let x = cx - 7; x <= cx + 7; x++) set(png, x, cy + 7, OUT);
    set(png, cx - 8, cy + 5, OUT);
    set(png, cx + 8, cy + 5, OUT);
    // Steam wisps
    const STEAM: RGBA = [220, 225, 235, 255];
    set(png, cx - 3, cy - 11, STEAM);
    set(png, cx - 2, cy - 12, STEAM);
    set(png, cx + 3, cy - 12, STEAM);
    set(png, cx + 4, cy - 11, STEAM);
    eyes(f, 3, -1);
    mouth(f, 3);
    cheeks(f, 5, 2);
    return png;
  },

  // DK — sunny puppy, goes crazy for food.
  doa(pose) {
    const f = frame(pose);
    const { png, cx, cy } = f;
    const CREAM: RGBA = [250, 230, 185, 255];
    const BROWN: RGBA = [170, 120, 70, 255];
    const droop = pose === 'sad' ? 2 : pose === 'jump' || pose === 'happy' ? -1 : 0;
    // Floppy ears
    fill(png, cx - 9, cy - 8 + droop, cx - 6, cy - 1 + droop, BROWN);
    fill(png, cx + 6, cy - 8 + droop, cx + 9, cy - 1 + droop, BROWN);
    circle(png, cx, cy, 8, CREAM, OUT);
    eyes(f);
    set(png, cx, cy, OUT); // nose
    mouth(f);
    if (pose === 'happy') set(png, cx, cy + 4, [255, 130, 150, 255]); // tongue
    cheeks(f);
    feet(f, CREAM);
    return png;
  },

  // Mingyu — the leader of potatoes; bigger than you expect.
  kimja(pose) {
    const f = frame(pose);
    const { png, cx, cy } = f;
    const TAN: RGBA = [210, 170, 110, 255];
    const DIMPLE: RGBA = [165, 125, 75, 255];
    const SPROUT: RGBA = [110, 190, 90, 255];
    ellipse(png, cx, cy, 10, 8, TAN, OUT);
    // Sprout on top
    set(png, cx, cy - 9, SPROUT);
    set(png, cx, cy - 10, SPROUT);
    set(png, cx - 1, cy - 11, SPROUT);
    set(png, cx + 1, cy - 11, SPROUT);
    // Dimples
    set(png, cx - 6, cy - 4, DIMPLE);
    set(png, cx + 7, cy - 2, DIMPLE);
    set(png, cx - 4, cy + 5, DIMPLE);
    eyes(f);
    mouth(f);
    cheeks(f);
    return png;
  },

  // The8 — a princely frog who likes rain, tea and quiet.
  thepalee(pose) {
    const f = frame(pose);
    const { png, cx, cy } = f;
    const GREEN: RGBA = [115, 200, 115, 255];
    const BELLY: RGBA = [215, 245, 205, 255];
    const GOLD: RGBA = [255, 210, 80, 255];
    const lift = pose === 'jump' ? -2 : 0;
    // Eye bumps on top
    circle(png, cx - 4, cy - 8 + lift, 3, GREEN, OUT);
    circle(png, cx + 4, cy - 8 + lift, 3, GREEN, OUT);
    circle(png, cx, cy, 8, GREEN, OUT);
    ellipse(png, cx, cy + 3, 4, 3, BELLY);
    // Eyes sit on the bumps
    if (pose === 'happy') {
      set(png, cx - 5, cy - 8 + lift, OUT);
      set(png, cx - 4, cy - 9 + lift, OUT);
      set(png, cx - 3, cy - 8 + lift, OUT);
      set(png, cx + 3, cy - 8 + lift, OUT);
      set(png, cx + 4, cy - 9 + lift, OUT);
      set(png, cx + 5, cy - 8 + lift, OUT);
    } else if (pose === 'sad') {
      set(png, cx - 5, cy - 9 + lift, OUT);
      set(png, cx - 4, cy - 8 + lift, OUT);
      set(png, cx + 4, cy - 8 + lift, OUT);
      set(png, cx + 5, cy - 9 + lift, OUT);
    } else {
      set(png, cx - 4, cy - 8 + lift, OUT);
      set(png, cx + 4, cy - 8 + lift, OUT);
    }
    // Tiny gold crown between the bumps
    set(png, cx - 1, cy - 12 + lift, GOLD);
    set(png, cx + 1, cy - 12 + lift, GOLD);
    fill(png, cx - 1, cy - 11 + lift, cx + 1, cy - 11 + lift, GOLD);
    // Wide frog smile
    if (pose === 'sad') {
      set(png, cx - 2, cy + 2, OUT);
      set(png, cx - 1, cy + 1, OUT);
      set(png, cx, cy + 1, OUT);
      set(png, cx + 1, cy + 1, OUT);
      set(png, cx + 2, cy + 2, OUT);
    } else {
      set(png, cx - 2, cy + 1, OUT);
      set(png, cx - 1, cy + 2, OUT);
      set(png, cx, cy + 2, OUT);
      set(png, cx + 1, cy + 2, OUT);
      set(png, cx + 2, cy + 1, OUT);
    }
    feet(f, GREEN);
    return png;
  },

  // Seungkwan — a Jeju tangerine whose eyes shine like diamonds.
  bboogyuli(pose) {
    const f = frame(pose);
    const { png, cx, cy } = f;
    const TANG: RGBA = [255, 165, 55, 255];
    const LEAF: RGBA = [95, 180, 85, 255];
    circle(png, cx, cy, 8, TANG, OUT);
    // Stem + leaf
    set(png, cx, cy - 9, [120, 90, 50, 255]);
    fill(png, cx + 1, cy - 11, cx + 3, cy - 10, LEAF);
    eyes(f);
    // Diamond-shine glints
    if (pose !== 'sad') {
      set(png, cx - 3, cy - 3, WHITE);
      set(png, cx + 5, cy - 3, WHITE);
    }
    mouth(f);
    cheeks(f);
    feet(f, TANG);
    return png;
  },

  // Vernon — the chill human of the bunch, hood up like a polar bear.
  nonver(pose) {
    const f = frame(pose);
    const { png, cx, cy } = f;
    const HOOD: RGBA = [245, 245, 250, 255];
    const SKIN: RGBA = pose === 'happy' ? [255, 225, 200, 255] : pose === 'sad' ? [225, 210, 225, 255] : [250, 220, 190, 255];
    const lift = pose === 'jump' ? -1 : 0;
    // Bear ears on the hood
    circle(png, cx - 6, cy - 8 + lift, 2, HOOD, OUT);
    circle(png, cx + 6, cy - 8 + lift, 2, HOOD, OUT);
    circle(png, cx, cy, 8, HOOD, OUT); // hood
    circle(png, cx, cy + 1, 5, SKIN); // face peeking out
    eyes(f, 3, 0);
    mouth(f, 3);
    feet(f, HOOD);
    return png;
  },

  // Dino — an ambitious otter who laughs a lot.
  chandalee(pose) {
    const f = frame(pose);
    const { png, cx, cy } = f;
    const BROWN: RGBA = [155, 115, 80, 255];
    const MUZZLE: RGBA = [235, 210, 175, 255];
    const lift = pose === 'jump' || pose === 'happy' ? -1 : 0;
    circle(png, cx - 6, cy - 7 + lift, 2, BROWN, OUT);
    circle(png, cx + 6, cy - 7 + lift, 2, BROWN, OUT);
    circle(png, cx, cy, 8, BROWN, OUT);
    ellipse(png, cx, cy + 2, 5, 4, MUZZLE);
    eyes(f);
    set(png, cx, cy, OUT); // nose
    mouth(f, 3);
    // Whisker dots
    set(png, cx - 4, cy + 2, OUT);
    set(png, cx + 4, cy + 2, OUT);
    // Flat tail to the side
    ellipse(png, cx + 10, cy + 6, 3, 2, BROWN, OUT);
    feet(f, BROWN);
    return png;
  },
};

for (const [id, fn] of Object.entries(draw)) {
  for (const pose of POSES) {
    save(fn(pose), path.join(ROOT, id, `${pose}.png`));
  }
}
console.log(`Wrote ${Object.keys(draw).length} MINITEEN villagers × ${POSES.length} poses`);
