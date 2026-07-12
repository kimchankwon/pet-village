/**
 * Generates the 13 MINITEEN villager NPC sprites (SEVENTEEN's official
 * mini characters) as original low-res pixel interpretations, drawn from
 * their documented traits:
 *   CHOITCHERRY sleepy white rabbit (red inner ears, tongue, cherry tail) ·
 *   JJONGTORAM child in a pink bunny suit · SHUASUMI fawn deer (antlers +
 *   round ears) · O.C.L a stack of three cats (white/gray/black) · TAMTAM
 *   yellow tiger · FOXDUNGEE lilac fox with round glasses · PPYOPULI fluffy
 *   white rice puff · DOA fluffy cream puppy · KIMJA sprouting potato ·
 *   THEpalee bright-eyed frog · BBOOGYULI tangerine (leaf + swirl) ·
 *   NONVER kid in a gray animal hood · CHANDALEE otter (white muzzle band).
 * Chibi build: big head + small body with stubby arms and feet, 32x42.
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

const W = 32;
const H = 42;

function blank() {
  const png = new PNG({ width: W, height: H });
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
      else if (outline && d <= 1 + 0.07) set(png, cx + x, cy + y, outline);
    }
  }
}

function save(png: InstanceType<typeof PNG>, file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}

const OUT: RGBA = [0, 0, 0, 255];
const WHITE: RGBA = [255, 255, 255, 255];
const BLUSH: RGBA = [255, 168, 186, 255];

// ------------------------------------------------------------------ frames

interface Frame {
  png: InstanceType<typeof PNG>;
  pose: Pose;
  /** vertical lift (jump) */
  dy: number;
  /** walk leg shuffle */
  leg: number;
}

const CX = 16;
const HEAD_Y = 15; // head centre
const HEAD_R = 9;
const BODY_Y = 30; // body centre
const FEET_Y = 38; // foot top

function frame(pose: Pose): Frame {
  return {
    png: blank(),
    pose,
    dy: pose === 'jump' ? -3 : 0,
    leg: pose === 'walk1' ? -2 : pose === 'walk2' ? 2 : 0,
  };
}

/**
 * Small torso under the head: round belly, stubby arms and two feet.
 * Draw BEFORE the head so the chin overlaps the body top.
 */
function chibiBody(f: Frame, body: RGBA, opts: { belly?: RGBA; feet?: RGBA } = {}) {
  const { png, pose, dy, leg } = f;
  const armsUp = pose === 'happy' || pose === 'jump';
  // Feet first (behind the body bottom)
  const feet = opts.feet ?? body;
  fill(png, CX - 6 + leg, FEET_Y + dy, CX - 3 + leg, FEET_Y + 2 + dy, feet);
  fill(png, CX + 3 - leg, FEET_Y + dy, CX + 6 - leg, FEET_Y + 2 + dy, feet);
  set(png, CX - 6 + leg, FEET_Y + 3 + dy, OUT);
  set(png, CX + 6 - leg, FEET_Y + 3 + dy, OUT);
  // Torso
  ellipse(png, CX, BODY_Y + dy, 7, 8, body, OUT);
  if (opts.belly) ellipse(png, CX, BODY_Y + 3 + dy, 4, 4, opts.belly);
  // Stubby arms
  if (armsUp) {
    fill(png, CX - 10, BODY_Y - 6 + dy, CX - 8, BODY_Y - 2 + dy, body);
    fill(png, CX + 8, BODY_Y - 6 + dy, CX + 10, BODY_Y - 2 + dy, body);
    set(png, CX - 10, BODY_Y - 7 + dy, OUT);
    set(png, CX + 10, BODY_Y - 7 + dy, OUT);
  } else {
    fill(png, CX - 9, BODY_Y - 2 + dy, CX - 7, BODY_Y + 2 + dy, body);
    fill(png, CX + 7, BODY_Y - 2 + dy, CX + 9, BODY_Y + 2 + dy, body);
    set(png, CX - 9, BODY_Y + 3 + dy, OUT);
    set(png, CX + 9, BODY_Y + 3 + dy, OUT);
  }
}

type EyeStyle = 'sparkle' | 'dot' | 'sleepy' | 'calm';

/** Eyes at head level; happy/sad poses override the character's style. */
function eyes(f: Frame, style: EyeStyle, dx = 3, ey = HEAD_Y + 1) {
  const { png, pose, dy } = f;
  const y = ey + dy;
  if (pose === 'happy') {
    for (const s of [-1, 1]) {
      set(png, CX + s * dx - 1, y, OUT);
      set(png, CX + s * dx, y - 1, OUT);
      set(png, CX + s * dx + 1, y, OUT);
    }
    return;
  }
  if (pose === 'sad') {
    set(png, CX - dx - 1, y - 1, OUT);
    set(png, CX - dx, y, OUT);
    set(png, CX + dx, y, OUT);
    set(png, CX + dx + 1, y - 1, OUT);
    return;
  }
  if (style === 'sleepy') {
    for (const s of [-1, 1]) {
      set(png, CX + s * dx - 1, y, OUT);
      set(png, CX + s * dx, y, OUT);
      set(png, CX + s * dx + 1, y, OUT);
    }
  } else if (style === 'calm') {
    for (const s of [-1, 1]) {
      set(png, CX + s * dx, y, OUT);
      set(png, CX + s * dx + s, y, OUT);
    }
  } else if (style === 'dot') {
    for (const s of [-1, 1]) {
      fill(png, CX + s * dx, y - 1, CX + s * dx + (s > 0 ? 0 : 0), y, OUT);
    }
  } else {
    // sparkle: 2x3 shiny anime eyes
    for (const s of [-1, 1]) {
      fill(png, CX + s * dx - 1, y - 2, CX + s * dx + 1, y + 1, OUT);
      set(png, CX + s * dx - (s > 0 ? 1 : -1), y - 1, WHITE);
      set(png, CX + s * dx + (s > 0 ? 1 : -1), y + 1, WHITE);
    }
  }
}

function smile(f: Frame, my = HEAD_Y + 5, tongue?: RGBA) {
  const { png, pose, dy } = f;
  const y = my + dy;
  if (pose === 'sad') {
    set(png, CX - 1, y + 1, OUT);
    set(png, CX, y, OUT);
    set(png, CX + 1, y + 1, OUT);
    return;
  }
  set(png, CX - 1, y, OUT);
  set(png, CX, y + 1, OUT);
  set(png, CX + 1, y, OUT);
  if (tongue && pose !== 'sad') {
    set(png, CX, y + 2, tongue);
    set(png, CX, y + 3, tongue);
  }
}

function cheeks(f: Frame, dx = 6, cy = HEAD_Y + 4, color: RGBA = BLUSH) {
  const { png, dy } = f;
  fill(png, CX - dx - 1, cy + dy, CX - dx, cy + dy, color);
  fill(png, CX + dx, cy + dy, CX + dx + 1, cy + dy, color);
}

// ---------------------------------------------------------------- characters

const draw: Record<string, (pose: Pose) => InstanceType<typeof PNG>> = {
  // S.Coups — sleepy-eyed white rabbit; red inner ears, tongue, cherry tail.
  choitcherry(pose) {
    const f = frame(pose);
    const { png, dy } = f;
    const RED_IN: RGBA = [178, 34, 52, 255];
    const earLift = pose === 'jump' || pose === 'happy' ? -1 : pose === 'sad' ? 2 : 0;
    // Tall upright ears with deep-red inner, rooted in the head
    for (const s of [-1, 1]) {
      const ex = CX + s * 4;
      ellipse(png, ex, HEAD_Y - 10 + earLift + dy, 2, 5, WHITE, OUT);
      fill(png, ex, HEAD_Y - 13 + earLift + dy, ex, HEAD_Y - 8 + earLift + dy, RED_IN);
    }
    // Cherry tail peeking out beside the body
    circle(png, CX + 10, BODY_Y + 4 + dy, 1, [210, 40, 60, 255], OUT);
    circle(png, CX + 12, BODY_Y + 6 + dy, 1, [210, 40, 60, 255], OUT);
    chibiBody(f, WHITE);
    circle(png, CX, HEAD_Y + dy, HEAD_R, WHITE, OUT);
    eyes(f, 'sleepy', 4);
    // Little lash ticks over the sleepy eyes
    if (pose !== 'happy' && pose !== 'sad') {
      set(png, CX - 5, HEAD_Y - 1 + dy, OUT);
      set(png, CX + 5, HEAD_Y - 1 + dy, OUT);
    }
    smile(f, HEAD_Y + 4);
    if (pose !== 'sad') set(png, CX, HEAD_Y + 6 + dy, [225, 60, 80, 255]); // tongue tip
    return png;
  },

  // Jeonghan — a kid tucked into a pink bunny suit, ears splayed like wings.
  jjongtoram(pose) {
    const f = frame(pose);
    const { png, dy } = f;
    const PINK: RGBA = [242, 168, 192, 255];
    const PINK_IN: RGBA = [255, 210, 224, 255];
    const SKIN: RGBA = [255, 228, 205, 255];
    const HAIR: RGBA = [72, 56, 52, 255];
    const earLift = pose === 'jump' || pose === 'happy' ? -1 : 0;
    // Butterfly-wing hood ears: big rounded lobes angled up-outward with
    // pale-yellow inners (per the official art)
    const EAR_IN: RGBA = [255, 238, 190, 255];
    for (const s of [-1, 1]) {
      const ex = CX + s * 8;
      const ey = HEAD_Y - 9 + earLift + dy;
      // Tilted lobe: stack of shrinking rows stepping outward
      ellipse(png, ex, ey, 4, 5, PINK, OUT);
      ellipse(png, ex + s, ey - 4, 3, 2.5, PINK, OUT);
      ellipse(png, ex, ey, 3.4, 4.4, PINK);
      ellipse(png, ex + s, ey - 4, 2.4, 1.9, PINK);
      ellipse(png, ex + s, ey - 1, 1.6, 2.4, EAR_IN);
    }
    chibiBody(f, PINK, { belly: PINK_IN });
    circle(png, CX, HEAD_Y + dy, HEAD_R, PINK, OUT); // hood
    circle(png, CX, HEAD_Y + 1 + dy, 6, SKIN); // face opening
    // Bangs under the hood rim
    fill(png, CX - 4, HEAD_Y - 4 + dy, CX + 4, HEAD_Y - 3 + dy, HAIR);
    set(png, CX - 2, HEAD_Y - 2 + dy, HAIR);
    set(png, CX + 1, HEAD_Y - 2 + dy, HAIR);
    eyes(f, 'dot', 3, HEAD_Y + 2);
    smile(f, HEAD_Y + 5);
    cheeks(f, 5, HEAD_Y + 4);
    return png;
  },

  // Joshua — gentle fawn deer: antlers, round ears, sparkly eyes, spots.
  shuasumi(pose) {
    const f = frame(pose);
    const { png, dy } = f;
    const FAWN: RGBA = [240, 178, 120, 255];
    const CREAM: RGBA = [255, 240, 218, 255];
    const ANTLER: RGBA = [150, 100, 60, 255];
    const lift = pose === 'jump' ? -1 : 0;
    // Antlers
    for (const s of [-1, 1]) {
      const ax = CX + s * 4;
      fill(png, ax, HEAD_Y - 14 + lift + dy, ax, HEAD_Y - 9 + lift + dy, ANTLER);
      set(png, ax + s, HEAD_Y - 12 + lift + dy, ANTLER);
      set(png, ax + s * 2, HEAD_Y - 13 + lift + dy, ANTLER);
    }
    // Round ears
    for (const s of [-1, 1]) {
      ellipse(png, CX + s * 8, HEAD_Y - 6 + lift + dy, 2, 2, FAWN, OUT);
    }
    chibiBody(f, FAWN, { belly: CREAM });
    circle(png, CX, HEAD_Y + dy, HEAD_R, FAWN, OUT);
    ellipse(png, CX, HEAD_Y + 4 + dy, 4, 3, CREAM); // muzzle
    // Fawn spots on the crown
    set(png, CX - 3, HEAD_Y - 6 + dy, CREAM);
    set(png, CX + 2, HEAD_Y - 7 + dy, CREAM);
    eyes(f, 'sparkle', 4, HEAD_Y);
    set(png, CX, HEAD_Y + 3 + dy, OUT); // nose
    smile(f, HEAD_Y + 5);
    cheeks(f, 6, HEAD_Y + 3);
    return png;
  },

  // Jun — Open, Close & Lock: three cats stacked in a wobbly tower.
  ocl(pose) {
    const f = frame(pose);
    const { png, pose: p, dy, leg } = f;
    const GRAY: RGBA = [168, 170, 182, 255];
    const BLACK: RGBA = [72, 70, 84, 255];
    const wob = leg; // the tower sways as it walks
    // Pyramid stack: big black cat at the bottom, small white on top
    const stack: { color: RGBA; cy: number; ox: number; rx: number; ry: number }[] = [
      { color: BLACK, cy: 33, ox: 0, rx: 8.5, ry: 6.5 },
      { color: GRAY, cy: 23, ox: wob, rx: 7, ry: 5.5 },
      { color: WHITE, cy: 13, ox: -wob, rx: 6, ry: 5 },
    ];
    // Feet on the bottom cat
    fill(png, CX - 5 + leg, FEET_Y + 1 + dy, CX - 2 + leg, FEET_Y + 2 + dy, BLACK);
    fill(png, CX + 2 - leg, FEET_Y + 1 + dy, CX + 5 - leg, FEET_Y + 2 + dy, BLACK);
    for (const cat of stack) {
      const cx = CX + cat.ox;
      const cy = cat.cy + dy;
      // Pointy ears
      for (const s of [-1, 1]) {
        const exx = cx + s * (cat.rx - 3);
        set(png, exx, cy - cat.ry - 2, OUT);
        fill(png, exx - 1, cy - cat.ry - 1, exx + 1, cy - cat.ry, cat.color);
      }
      ellipse(png, cx, cy, cat.rx, cat.ry, cat.color, OUT);
    }
    // Tiny green sprout on the black cat's forehead (per the official art)
    const SPROUT: RGBA = [118, 190, 96, 255];
    set(png, CX, 29 + dy, SPROUT);
    set(png, CX + 1, 28 + dy, SPROUT);
    set(png, CX - 1, 28 + dy, SPROUT);
    // Faces: top >< happy, middle sleepy, bottom calm dots
    const face = (cx: number, cy: number, ink: RGBA, style: 'squint' | 'sleepy' | 'dot') => {
      if (p === 'sad') {
        set(png, cx - 3, cy - 1, ink);
        set(png, cx - 2, cy, ink);
        set(png, cx + 2, cy, ink);
        set(png, cx + 3, cy - 1, ink);
      } else if (style === 'squint' || p === 'happy') {
        set(png, cx - 3, cy, ink);
        set(png, cx - 2, cy - 1, ink);
        set(png, cx + 2, cy - 1, ink);
        set(png, cx + 3, cy, ink);
      } else if (style === 'sleepy') {
        fill(png, cx - 3, cy, cx - 2, cy, ink);
        fill(png, cx + 2, cy, cx + 3, cy, ink);
      } else {
        set(png, cx - 2, cy, ink);
        set(png, cx + 2, cy, ink);
      }
      // w mouth
      set(png, cx - 1, cy + 2, ink);
      set(png, cx, cy + 1, ink);
      set(png, cx + 1, cy + 2, ink);
    };
    face(CX - wob, 13 + dy, OUT, 'squint');
    face(CX + wob, 24 + dy, OUT, 'sleepy');
    face(CX, 34 + dy, [235, 235, 245, 255], 'dot');
    return png;
  },

  // Hoshi — chubby yellow tiger with brown stripes. Horanghae!
  tamtam(pose) {
    const f = frame(pose);
    const { png, dy } = f;
    const YELLOW: RGBA = [250, 205, 90, 255];
    const STRIPE: RGBA = [146, 96, 40, 255];
    const CREAM: RGBA = [255, 244, 220, 255];
    const lift = pose === 'jump' || pose === 'happy' ? -1 : 0;
    // Round ears
    for (const s of [-1, 1]) {
      circle(png, CX + s * 7, HEAD_Y - 7 + lift + dy, 2, YELLOW, OUT);
    }
    chibiBody(f, YELLOW, { belly: CREAM });
    // Body stripes
    fill(png, CX - 7, BODY_Y - 1 + dy, CX - 6, BODY_Y + 1 + dy, STRIPE);
    fill(png, CX + 6, BODY_Y - 1 + dy, CX + 7, BODY_Y + 1 + dy, STRIPE);
    circle(png, CX, HEAD_Y + dy, HEAD_R, YELLOW, OUT);
    // Forehead + temple stripes
    fill(png, CX, HEAD_Y - 8 + dy, CX, HEAD_Y - 6 + dy, STRIPE);
    fill(png, CX - 3, HEAD_Y - 8 + dy, CX - 3, HEAD_Y - 7 + dy, STRIPE);
    fill(png, CX + 3, HEAD_Y - 8 + dy, CX + 3, HEAD_Y - 7 + dy, STRIPE);
    fill(png, CX - 9, HEAD_Y + dy, CX - 8, HEAD_Y + 1 + dy, STRIPE);
    fill(png, CX + 8, HEAD_Y + dy, CX + 9, HEAD_Y + 1 + dy, STRIPE);
    ellipse(png, CX, HEAD_Y + 4 + dy, 4, 3, CREAM); // muzzle
    eyes(f, 'dot', 4, HEAD_Y);
    set(png, CX, HEAD_Y + 3 + dy, OUT); // nose
    // Big open smile with a pink tongue
    if (pose === 'sad') {
      smile(f, HEAD_Y + 5);
    } else {
      fill(png, CX - 1, HEAD_Y + 5 + dy, CX + 1, HEAD_Y + 5 + dy, OUT);
      fill(png, CX - 1, HEAD_Y + 6 + dy, CX + 1, HEAD_Y + 6 + dy, [240, 120, 130, 255]);
      set(png, CX - 2, HEAD_Y + 4 + dy, OUT);
      set(png, CX + 2, HEAD_Y + 4 + dy, OUT);
    }
    // Stripes on the cute tummy
    fill(png, CX - 2, BODY_Y + 3 + dy, CX - 1, BODY_Y + 3 + dy, STRIPE);
    fill(png, CX + 1, BODY_Y + 5 + dy, CX + 2, BODY_Y + 5 + dy, STRIPE);
    return png;
  },

  // Wonwoo — lilac fox in round glasses, fluffy white-tipped tail.
  foxdungee(pose) {
    const f = frame(pose);
    const { png, pose: p, dy } = f;
    const LILAC: RGBA = [186, 148, 220, 255];
    const DEEP: RGBA = [140, 100, 180, 255];
    const CREAM: RGBA = [248, 240, 255, 255];
    const lift = p === 'jump' || p === 'happy' ? -2 : 0; // ears perk up
    // Big pointed ears with pale inner
    for (const s of [-1, 1]) {
      const ex = CX + s * 6;
      set(png, ex, HEAD_Y - 13 + lift + dy, OUT);
      fill(png, ex - 1, HEAD_Y - 12 + lift + dy, ex + 1, HEAD_Y - 10 + lift + dy, DEEP);
      fill(png, ex - 2, HEAD_Y - 9 + lift + dy, ex + 2, HEAD_Y - 7 + lift + dy, LILAC);
      fill(png, ex - 1, HEAD_Y - 8 + lift + dy, ex + 1, HEAD_Y - 7 + lift + dy, WHITE); // fluffy tuft
      set(png, ex, HEAD_Y - 9 + lift + dy, WHITE);
    }
    // Fluffy tail with pale tip
    ellipse(png, CX + 11, BODY_Y + 2 + dy, 3, 4, LILAC, OUT);
    ellipse(png, CX + 11, BODY_Y - 1 + dy, 2, 1.5, CREAM);
    chibiBody(f, LILAC, { belly: CREAM });
    circle(png, CX, HEAD_Y + dy, HEAD_R, LILAC, OUT);
    ellipse(png, CX, HEAD_Y + 4 + dy, 4, 3, CREAM); // muzzle
    // Round glasses — the signature
    if (p !== 'happy' && p !== 'sad') {
      for (const s of [-1, 1]) {
        circle(png, CX + s * 4, HEAD_Y + dy, 2.6, [0, 0, 0, 0], OUT);
      }
      set(png, CX - 1, HEAD_Y + dy, OUT); // bridge
      set(png, CX + 1, HEAD_Y + dy, OUT);
      // pupils behind the lenses
      set(png, CX - 4, HEAD_Y + dy, OUT);
      set(png, CX + 4, HEAD_Y + dy, OUT);
    } else {
      eyes(f, 'dot', 4, HEAD_Y);
    }
    set(png, CX, HEAD_Y + 3 + dy, OUT); // nose
    smile(f, HEAD_Y + 6);
    return png;
  },

  // Woozi — a fluffy white puff of steamed rice; blushes when pleased.
  ppyopuli(pose) {
    const f = frame(pose);
    const { png, pose: p, dy, leg } = f;
    const body: RGBA = p === 'happy' ? [255, 244, 248, 255] : [250, 250, 252, 255];
    const cy = 22 + dy;
    // Nub feet
    fill(png, CX - 5 + leg, 36 + dy, CX - 2 + leg, 38 + dy, body);
    fill(png, CX + 2 - leg, 36 + dy, CX + 5 - leg, 38 + dy, body);
    set(png, CX - 5 + leg, 39 + dy, OUT);
    set(png, CX + 5 - leg, 39 + dy, OUT);
    // Fluffy cloud: overlapping lobes around a fat core
    circle(png, CX, cy, 9, body, OUT);
    for (const [ox, oy] of [[-7, -6], [0, -9], [7, -6], [-9, 1], [9, 1], [-6, 7], [6, 7]]) {
      circle(png, CX + ox, cy + oy, 4, body, OUT);
    }
    // Re-fill the interior so lobe outlines don't cross the face
    circle(png, CX, cy, 8, body);
    for (const [ox, oy] of [[-7, -6], [0, -9], [7, -6], [-9, 1], [9, 1], [-6, 7], [6, 7]]) {
      circle(png, CX + ox, cy + oy, 3, body);
    }
    // Simple face: chunky dot eyes + kissy mouth so it reads on the white
    if (pose === 'happy' || pose === 'sad') {
      eyes(f, 'dot', 3, cy - 1);
    } else {
      // Two chunky 2x2 dot eyes (the old fill had inverted bounds on the
      // left side, so only the right eye was drawn)
      fill(png, CX - 4, cy - 2, CX - 3, cy - 1, OUT);
      fill(png, CX + 3, cy - 2, CX + 4, cy - 1, OUT);
    }
    set(png, CX, cy + 1, OUT);
    set(png, CX + 1, cy + 2, OUT);
    set(png, CX, cy + 3, OUT);
    // Single pink cheek on the right — that's how the art has it
    fill(png, CX + 5, cy + 1, CX + 6, cy + 1, [255, 150, 170, 255]);
    return png;
  },

  // DK — fluffy cream puppy: poofy crown, floppy ears, tongue out.
  doa(pose) {
    const f = frame(pose);
    const { png, pose: p, dy } = f;
    const CREAM: RGBA = [250, 236, 205, 255];
    const FLUFF: RGBA = [255, 248, 230, 255];
    const droop = p === 'sad' ? 2 : 0;
    // Floppy ears
    for (const s of [-1, 1]) {
      ellipse(png, CX + s * 8, HEAD_Y - 1 + droop + dy, 2.5, 5, CREAM, OUT);
    }
    chibiBody(f, CREAM, { belly: FLUFF });
    circle(png, CX, HEAD_Y + dy, HEAD_R, FLUFF, OUT);
    // Poofy fur bumps on the crown
    for (const [ox, oy] of [[-6, -6], [-2, -8], [3, -8], [6, -5]]) {
      circle(png, CX + ox, HEAD_Y + oy + dy, 2.5, FLUFF, OUT);
    }
    circle(png, CX, HEAD_Y + dy, HEAD_R - 1, FLUFF);
    eyes(f, 'dot', 3, HEAD_Y);
    set(png, CX, HEAD_Y + 3 + dy, [110, 80, 60, 255]); // nose
    smile(f, HEAD_Y + 5, [240, 120, 130, 255]); // tongue
    cheeks(f, 6, HEAD_Y + 3);
    return png;
  },

  // Mingyu — the leader of potatoes: tall spud, sprout, freckles, big grin.
  kimja(pose) {
    const f = frame(pose);
    const { png, pose: p, dy, leg } = f;
    const SPUD: RGBA = [226, 190, 110, 255];
    const DARK: RGBA = [176, 138, 70, 255];
    const HAIR: RGBA = [196, 152, 62, 255];
    const cy = 22 + dy;
    // Feet nubs
    fill(png, CX - 5 + leg, 37 + dy, CX - 2 + leg, 39 + dy, SPUD);
    fill(png, CX + 2 - leg, 37 + dy, CX + 5 - leg, 39 + dy, SPUD);
    // Tall potato body (head and body in one)
    ellipse(png, CX, cy, 9, 13, SPUD, OUT);
    // Golden hair swoosh (per the official art — not a green sprout)
    set(png, CX - 1, cy - 14, HAIR);
    set(png, CX, cy - 15, HAIR);
    set(png, CX + 1, cy - 15, HAIR);
    set(png, CX + 2, cy - 16, HAIR);
    set(png, CX + 3, cy - 15, HAIR);
    // Stubby arms
    const armY = p === 'happy' || p === 'jump' ? cy - 2 : cy + 3;
    fill(png, CX - 11, armY, CX - 9, armY + 3, SPUD);
    fill(png, CX + 9, armY, CX + 11, armY + 3, SPUD);
    // Freckles + the little "17" on each cheek
    set(png, CX - 6, cy - 3, DARK);
    set(png, CX + 6, cy - 3, DARK);
    for (const sgn of [-1, 1]) {
      const bx = CX + sgn * 6;
      fill(png, bx - 1, cy + 1, bx - 1, cy + 3, DARK); // 1
      fill(png, bx + 1, cy + 1, bx + 2, cy + 1, DARK); // 7 top bar
      set(png, bx + 2, cy + 2, DARK);
      set(png, bx + 1, cy + 3, DARK);
    }
    eyes(f, 'sparkle', 4, cy - 4);
    set(png, CX, cy - 1, [140, 100, 55, 255]); // nose
    // Wide grin
    if (p === 'sad') {
      fill(png, CX - 2, cy + 3, CX + 2, cy + 3, OUT);
      set(png, CX - 3, cy + 4, OUT);
      set(png, CX + 3, cy + 4, OUT);
    } else {
      set(png, CX - 3, cy + 2, OUT);
      fill(png, CX - 2, cy + 3, CX + 2, cy + 3, OUT);
      set(png, CX + 3, cy + 2, OUT);
      set(png, CX, cy + 4, [230, 130 , 140, 255]);
    }
    return png;
  },

  // The8 — calm frog with huge glossy eyes on top of his head.
  thepalee(pose) {
    const f = frame(pose);
    const { png, pose: p, dy } = f;
    const GREEN: RGBA = [150, 200, 96, 255];
    const BELLY: RGBA = [226, 244, 198, 255];
    const lift = p === 'jump' ? -1 : 0;
    chibiBody(f, GREEN, { belly: BELLY });
    circle(png, CX, HEAD_Y + 1 + dy, HEAD_R, GREEN, OUT);
    // Eye bumps merged into the crown
    for (const s of [-1, 1]) {
      circle(png, CX + s * 5, HEAD_Y - 7 + lift + dy, 4, GREEN, OUT);
      circle(png, CX + s * 5, HEAD_Y - 7 + lift + dy, 3.4, GREEN);
    }
    // Huge glossy eyes (or squints on emotion poses)
    for (const s of [-1, 1]) {
      const ex = CX + s * 5;
      const ey = HEAD_Y - 7 + lift + dy;
      if (p === 'happy') {
        set(png, ex - 1, ey, OUT);
        set(png, ex, ey - 1, OUT);
        set(png, ex + 1, ey, OUT);
      } else if (p === 'sad') {
        set(png, ex - 1, ey, OUT);
        set(png, ex + 1, ey - 1, OUT);
      } else {
        circle(png, ex, ey, 2.4, OUT);
        set(png, ex - 1, ey - 1, WHITE);
        set(png, ex + 1, ey + 1, WHITE);
      }
    }
    // Wide little smile + rosy cheeks
    if (p === 'sad') {
      set(png, CX - 2, HEAD_Y + 4 + dy, OUT);
      set(png, CX - 1, HEAD_Y + 3 + dy, OUT);
      set(png, CX + 1, HEAD_Y + 3 + dy, OUT);
      set(png, CX + 2, HEAD_Y + 4 + dy, OUT);
    } else {
      set(png, CX - 2, HEAD_Y + 3 + dy, OUT);
      set(png, CX - 1, HEAD_Y + 4 + dy, OUT);
      set(png, CX, HEAD_Y + 4 + dy, OUT);
      set(png, CX + 1, HEAD_Y + 4 + dy, OUT);
      set(png, CX + 2, HEAD_Y + 3 + dy, OUT);
    }
    cheeks(f, 6, HEAD_Y + 3, [244, 150, 130, 255]);
    return png;
  },

  // Seungkwan — Jeju tangerine with a leaf, swirl top and shining eyes.
  bboogyuli(pose) {
    const f = frame(pose);
    const { png, dy } = f;
    const TANG: RGBA = [250, 158, 58, 255];
    const TANG_D: RGBA = [216, 122, 34, 255];
    const LEAF: RGBA = [104, 182, 88, 255];
    chibiBody(f, TANG);
    circle(png, CX, HEAD_Y + dy, HEAD_R, TANG, OUT);
    // Peel swirl on the crown
    set(png, CX - 1, HEAD_Y - 6 + dy, TANG_D);
    set(png, CX, HEAD_Y - 7 + dy, TANG_D);
    set(png, CX + 1, HEAD_Y - 6 + dy, TANG_D);
    set(png, CX, HEAD_Y - 5 + dy, TANG_D);
    // Stem + leaf
    set(png, CX, HEAD_Y - 9 + dy, [124, 90, 48, 255]);
    fill(png, CX + 1, HEAD_Y - 11 + dy, CX + 4, HEAD_Y - 10 + dy, LEAF);
    set(png, CX + 2, HEAD_Y - 12 + dy, LEAF);
    // Big eyes with heart-shaped glints
    if (pose === 'happy' || pose === 'sad') {
      eyes(f, 'dot', 4, HEAD_Y);
    } else {
      for (const sgn of [-1, 1]) {
        const ex = CX + sgn * 4;
        fill(png, ex - 1, HEAD_Y - 2 + dy, ex + 1, HEAD_Y + 1 + dy, OUT);
        set(png, ex - 1, HEAD_Y - 1 + dy, WHITE); // heart glint: two lobes...
        set(png, ex + 1, HEAD_Y - 1 + dy, WHITE);
        set(png, ex, HEAD_Y + dy, WHITE); // ...meeting in a point
      }
    }
    set(png, CX, HEAD_Y + 3 + dy, [210, 60, 60, 255]); // little red nose
    smile(f, HEAD_Y + 5);
    cheeks(f, 6, HEAD_Y + 3);
    return png;
  },

  // Vernon — chill kid in a gray animal hood, calm straight gaze.
  nonver(pose) {
    const f = frame(pose);
    const { png, dy } = f;
    const HOOD: RGBA = [172, 176, 188, 255];
    const SUIT: RGBA = [108, 110, 124, 255];
    const SKIN: RGBA = [255, 226, 200, 255];
    const HAIR: RGBA = [96, 72, 56, 255];
    // Round hood ears
    for (const s of [-1, 1]) {
      circle(png, CX + s * 6, HEAD_Y - 8 + dy, 2.5, HOOD, OUT);
    }
    chibiBody(f, SUIT, { feet: SUIT });
    circle(png, CX, HEAD_Y + dy, HEAD_R, HOOD, OUT);
    circle(png, CX, HEAD_Y + 1 + dy, 6, SKIN); // face opening
    // Fringe under the hood
    fill(png, CX - 4, HEAD_Y - 3 + dy, CX + 4, HEAD_Y - 3 + dy, HAIR);
    set(png, CX - 3, HEAD_Y - 2 + dy, HAIR);
    set(png, CX + 2, HEAD_Y - 2 + dy, HAIR);
    // Bold straight brows over calm eyes — the signature look
    if (pose !== 'happy' && pose !== 'sad') {
      fill(png, CX - 4, HEAD_Y + dy, CX - 2, HEAD_Y + dy, HAIR);
      fill(png, CX + 2, HEAD_Y + dy, CX + 4, HEAD_Y + dy, HAIR);
    }
    eyes(f, 'calm', 3, HEAD_Y + 2);
    // Neutral flat mouth (small smile when happy)
    if (pose === 'happy') smile(f, HEAD_Y + 5);
    else if (pose === 'sad') smile(f, HEAD_Y + 5);
    else fill(png, CX - 1, HEAD_Y + 5 + dy, CX + 1, HEAD_Y + 5 + dy, OUT);
    return png;
  },

  // Dino — cheerful otter: brown crown, white muzzle band, round ears.
  chandalee(pose) {
    const f = frame(pose);
    const { png, dy } = f;
    const BROWN: RGBA = [188, 138, 92, 255];
    const CREAM: RGBA = [255, 246, 230, 255];
    const lift = pose === 'jump' || pose === 'happy' ? -1 : 0;
    // Small round ears
    for (const s of [-1, 1]) {
      circle(png, CX + s * 7, HEAD_Y - 7 + lift + dy, 2, BROWN, OUT);
    }
    // Flat tail
    ellipse(png, CX + 11, BODY_Y + 5 + dy, 3, 2, BROWN, OUT);
    chibiBody(f, BROWN, { belly: CREAM });
    circle(png, CX, HEAD_Y + dy, HEAD_R, BROWN, OUT);
    // Little hair strands on the crown
    set(png, CX - 1, HEAD_Y - 10 + dy, OUT);
    set(png, CX + 1, HEAD_Y - 11 + dy, OUT);
    set(png, CX + 2, HEAD_Y - 10 + dy, OUT);
    // White muzzle band across the lower face
    ellipse(png, CX, HEAD_Y + 4 + dy, 6.5, 4, CREAM);
    eyes(f, 'dot', 4, HEAD_Y - 1);
    ellipse(png, CX, HEAD_Y + 2 + dy, 1.4, 1, [90, 62, 48, 255]); // big otter nose
    smile(f, HEAD_Y + 5);
    cheeks(f, 7, HEAD_Y + 2);
    return png;
  },
};

function sealOutline(png: InstanceType<typeof PNG>) {
  const add: [number, number][] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (W * y + x) << 2;
      if (png.data[i + 3] < 200) continue;
      if (png.data[i] === 0 && png.data[i + 1] === 0 && png.data[i + 2] === 0) continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) {
          add.push([x, y]);
          break;
        }
        const ni = (W * ny + nx) << 2;
        if (png.data[ni + 3] < 200) {
          add.push([x, y]);
          break;
        }
      }
    }
  }
  for (const [x, y] of add) set(png, x, y, OUT);
}

for (const [id, fn] of Object.entries(draw)) {
  for (const pose of POSES) {
    const png = fn(pose);
    sealOutline(png);
    save(png, path.join(ROOT, id, `${pose}.png`));
  }
}
console.log(`Wrote ${Object.keys(draw).length} MINITEEN villagers × ${POSES.length} poses (${W}x${H})`);
