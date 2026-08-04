import Phaser from 'phaser';
import { ACCESSORIES, type AccessoryId, type AccessorySlot } from '../systems/accessories';
import {
  CHARACTER_PENGUIN_DISPLAY_HEIGHT,
  DANCE_STAND_FEET_RATIO,
  DANCE_STAND_HEIGHT_RATIO,
  DANCE_STAND_TOP_RATIO,
  IDLE_BODY_HEIGHT_RATIO,
  IDLE_FEET_BELOW_CENTRE_RATIO,
} from '../systems/characterScale';
import { State } from '../systems/GameState';
import {
  LOCAL_PENGUIN_DANCE_TEXTURE_KEY,
  LOCAL_PENGUIN_WAVE_TEXTURE_KEY,
  normalizePenguinColor,
  remotePenguinDanceTextureKey,
  remotePenguinTextureKey,
  remotePenguinWalkAnimKey,
  remotePenguinWaveTextureKey,
} from '../systems/multiplayerPresentation';

// Pixel-art textures generated at runtime from character grids.
// Each sprite is an array of strings; each character maps to a palette color,
// '.' is transparent. Everything renders at SCALE px per pixel-art pixel.
// To use real image assets later, replace generateTextures() with loader calls
// that register the same texture keys.

export const SCALE = 3;

const PALETTE: Record<string, string> = {
  k: '#000000', // outline / true black
  w: '#ffffff',
  W: '#f2ecff', // soft white
  g: '#8a8a9e', // grey
  o: '#ff8a1a', // orange (beak/feet)
  O: '#e86a00', // dark orange
  y: '#ffe066', // yellow
  Y: '#d4a83c', // dark yellow / gold
  p: '#ffb3d1', // pink
  P: '#ff7fab', // deep pink
  r: '#ff6b6b', // red
  R: '#c0392b', // dark red
  b: '#74b9ff', // blue
  B: '#4a69bd', // dark blue
  n: '#8d6e63', // brown
  N: '#5d4037', // dark brown
  e: '#a8e6cf', // mint
  E: '#56c596', // green
  D: '#2e7d52', // dark green
  t: '#95a5a6', // steel
  c: '#fdf6e3', // cream
  C: '#f5deb3', // wheat / tan
  l: '#c8a2c8', // lilac
  L: '#9b59b6', // purple
  s: '#87ceeb', // sky
  x: '#3d3d5c', // dark slate
  m: '#ffd7a8', // skin / peach
  q: '#7ed6df', // aqua
  Q: '#22a6b3', // dark aqua
  v: '#0a3d6e', // penguin navy (Club Penguin-style)
  V: '#062848', // penguin navy shade
  u: '#14528a', // penguin navy highlight
  z: '#b8b8c0', // belly soft shadow
};

// Penguin body colourways — the classic Club Penguin (PC3) dozen, sampled
// from the original colour picker. The v/V/u palette slots are swapped
// before the penguin textures are generated (or regenerated on change).
function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const adj = (v: number) => {
    const nv = f < 0 ? v * (1 + f) : v + (255 - v) * f;
    return Math.max(0, Math.min(255, Math.round(nv)));
  };
  return (
    '#' +
    [adj((n >> 16) & 255), adj((n >> 8) & 255), adj(n & 255)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

const CP_COLOURS: [string, string, string][] = [
  // Default blue sampled toward the classic CP sticker / Tenor gif look
  ['blue', 'Blue', '#0090d0'],
  ['green', 'Green', '#009000'],
  ['pink', 'Pink', '#f03090'],
  ['black', 'Black', '#303030'],
  ['red', 'Red', '#c00000'],
  ['purple', 'Purple', '#9000f0'],
  ['orange', 'Orange', '#f06000'],
  ['darkpurple', 'Dark Purple', '#600090'],
  ['brown', 'Brown', '#906000'],
  ['peach', 'Peach', '#f06060'],
  ['darkgreen', 'Dark Green', '#006000'],
  ['lightblue', 'Light Blue', '#40b0e8'],
];

export const PENGUIN_COLORS: Record<string, { label: string; v: string; V: string; u: string }> =
  Object.fromEntries(
    CP_COLOURS.map(([id, label, base]) => [
      id,
      { label, v: base, V: shadeHex(base, -0.4), u: shadeHex(base, 0.25) },
    ]),
  );

function setPenguinPalette(color: string) {
  const c = PENGUIN_COLORS[color] ?? PENGUIN_COLORS.blue;
  PALETTE.v = c.v;
  PALETTE.V = c.V;
  PALETTE.u = c.u;
}

type Grid = string[];

// ---- Penguin player (18x20), 2 walk frames per facing ----
// Redesigned from classic Club Penguin sticker/gif ref (cp-user-ref.jpeg +
// Imagine front/side/back plates): pointed dome, wing flippers, big orange
// beak, close-set eyes, large white belly with soft grey under the chin,
// orange feet. Landmark rows kept for clothes overlays:
//   0–3 hat · 4–5 eyes/mask · 6–8 beak/chin · 9–16 body · 18–19 feet.
// Grid fallback: idle plant + two alternating mid-stride frames.
// Sheet frame 0 = idle (stop); frames 1–2 = walk L/R (not plant+hop).
const PENGUIN_DOWN_IDLE: Grid = [
  '.......kkkk.......',
  '.....kkvvvvkk.....',
  '....kuvvvvvvuk....',
  '...kuvvvvvvvvuk...',
  // Close-set CP eyes above a big orange beak
  '...kvvvwwvwwvvk...',
  '...kvvvwkwkwvvk...',
  '..kvvvvoOOOovvvk..',
  '..kvvvooOOOoovvk..',
  '..kvvvvzzzzzvvvk..', // soft grey under beak
  '.kvkvvwwzzzzvvkvk.', // wing flippers + belly
  'kvkvvwwwwwwwwvvkvk',
  'kvkvwwwwwwwwwwvkvk',
  'kvkvwwwwwwwwwwvkvk',
  '.kvvwwwwwwwwwwvvk.',
  '.kvvvwwwwwwwwvvvk.',
  '..kvvvvwwwwvvvvk..',
  '...kVvvvvvvvvVk...',
  '....kVVvvvvVVk....',
  '....koo....ook....', // both feet planted
  '...kOoo....ooOk...',
];
const PENGUIN_DOWN_0: Grid = [
  '.......kkkk.......',
  '.....kkvvvvkk.....',
  '....kuvvvvvvuk....',
  '...kuvvvvvvvvuk...',
  '...kvvvwwvwwvvk...',
  '...kvvvwkwkwvvk...',
  '..kvvvvoOOOovvvk..',
  '..kvvvooOOOoovvk..',
  '..kvvvvzzzzzvvvk..',
  '.kvkvvwwzzzzvvkvk.',
  'kvkvvwwwwwwwwvvkvk',
  'kvkvwwwwwwwwwwvkvk',
  'kvkvwwwwwwwwwwvkvk',
  '.kvvwwwwwwwwwwvvk.',
  '.kvvvwwwwwwwwvvvk.',
  '..kvvvvwwwwvvvvk..',
  '...kVvvvvvvvvVk...',
  '....kVVvvvvVVk....',
  '...koo......ook...', // left foot forward/raised
  '..kOoo........ook.',
];
const PENGUIN_DOWN_1: Grid = [
  '.......kkkk.......',
  '.....kkvvvvkk.....',
  '....kuvvvvvvuk....',
  '...kuvvvvvvvvuk...',
  '...kvvvwwvwwvvk...',
  '...kvvvwkwkwvvk...',
  '..kvvvvoOOOovvvk..',
  '..kvvvooOOOoovvk..',
  '..kvvvvzzzzzvvvk..',
  '.kvkvvwwzzzzvvkvk.',
  'kvkvvwwwwwwwwvvkvk',
  'kvkvwwwwwwwwwwvkvk',
  'kvkvwwwwwwwwwwvkvk',
  '.kvvwwwwwwwwwwvvk.',
  '.kvvvwwwwwwwwvvvk.',
  '..kvvvvwwwwvvvvk..',
  '...kVvvvvvvvvVk...',
  '....kVVvvvvVVk....',
  '...koo......ook...', // right foot forward/raised
  '.koo........ooOk..',
];

function authoredWaveFrame(changes: Record<number, string>): Grid {
  return PENGUIN_DOWN_IDLE.map((row, index) => changes[index] ?? row);
}

// Authored front-facing flipper wave. Each pose changes the silhouette itself:
// the screen-left flipper rises from the side, reaches overhead, and lowers.
const PENGUIN_WAVE_1 = authoredWaveFrame({
  7: '.kkvvvooOOOoovvk..',
  8: 'kvkvvvvzzzzzvvvk..',
  9: 'kvkvvwwzzzzvvkvk..',
  10: '.kvvwwwwwwwwvvkvk.',
  11: '.kvwwwwwwwwwwvkvk.',
  12: '.kvwwwwwwwwwwvkvk.',
});
const PENGUIN_WAVE_2 = authoredWaveFrame({
  3: '..kkuvvvvvvvvuk...',
  4: '.kvkvvvwwvwwvvk...',
  5: 'kvkvvvvwkwkwvvk...',
  6: 'kvkvvvvoOOOovvvk..',
  7: '.kkvvvooOOOoovvk..',
  8: '..kvvvvzzzzzvvvk..',
  9: '..kvvwwzzzzvvkvk..',
  10: '..kvwwwwwwwwvvkvk.',
  11: '..kwwwwwwwwwwvkvk.',
  12: '..kvwwwwwwwwwwvkvk',
});
const PENGUIN_WAVE_3 = authoredWaveFrame({
  0: '..kk...kkkk.......',
  1: '.kvvk.kkvvvvkk....',
  2: 'kvvvkkuvvvvvvuk...',
  3: 'kvvkkvvvvvvvvuk...',
  4: '.kkkvvvwwvwwvvk...',
});
const PENGUIN_WAVE_GRIDS = [PENGUIN_DOWN_IDLE, PENGUIN_WAVE_1, PENGUIN_WAVE_2, PENGUIN_WAVE_3];

const PENGUIN_UP_IDLE: Grid = [
  '.......kkkk.......',
  '.....kkvvvvkk.....',
  '....kuvvvvvvuk....',
  '...kuvvvvvvvvuk...',
  '...kvvvvvvvvvvk...',
  '...kvvvvvvvvvvk...',
  '..kvvvvvvvvvvvvk..',
  '..kvvvvvvvvvvvvk..',
  '.kvkvvvvvvvvvkvvk.',
  'kvkvvvvvvvvvvvkvk.',
  'kvkvvvvvvvvvvvkvk.',
  'kvkvvvvvvvvvvvkvk.',
  'kvkvVvvvvvvvvVkvk.',
  '.kvvVvvvvvvvvVvk..',
  '.kvvvVvvvvvvVvvvk.',
  '..kvvvvVVVVvvvvk..',
  '...kVvvvvvvvvVk...',
  '....kVVvvvvVVk....',
  '....koo....ook....',
  '...kOoo....ooOk...',
];
const PENGUIN_UP_0: Grid = [
  '.......kkkk.......',
  '.....kkvvvvkk.....',
  '....kuvvvvvvuk....',
  '...kuvvvvvvvvuk...',
  '...kvvvvvvvvvvk...',
  '...kvvvvvvvvvvk...',
  '..kvvvvvvvvvvvvk..',
  '..kvvvvvvvvvvvvk..',
  '.kvkvvvvvvvvvkvvk.',
  'kvkvvvvvvvvvvvkvk.',
  'kvkvvvvvvvvvvvkvk.',
  'kvkvvvvvvvvvvvkvk.',
  'kvkvVvvvvvvvvVkvk.',
  '.kvvVvvvvvvvvVvk..',
  '.kvvvVvvvvvvVvvvk.',
  '..kvvvvVVVVvvvvk..',
  '...kVvvvvvvvvVk...',
  '....kVVvvvvVVk....',
  '...koo......ook...', // left foot forward
  '..kOoo........ook.',
];
const PENGUIN_UP_1: Grid = [
  '.......kkkk.......',
  '.....kkvvvvkk.....',
  '....kuvvvvvvuk....',
  '...kuvvvvvvvvuk...',
  '...kvvvvvvvvvvk...',
  '...kvvvvvvvvvvk...',
  '..kvvvvvvvvvvvvk..',
  '..kvvvvvvvvvvvvk..',
  '.kvkvvvvvvvvvkvvk.',
  'kvkvvvvvvvvvvvkvk.',
  'kvkvvvvvvvvvvvkvk.',
  'kvkvvvvvvvvvvvkvk.',
  'kvkvVvvvvvvvvVkvk.',
  '.kvvVvvvvvvvvVvk..',
  '.kvvvVvvvvvvVvvvk.',
  '..kvvvvVVVVvvvvk..',
  '...kVvvvvvvvvVk...',
  '....kVVvvvvVVk....',
  '...koo......ook...', // right foot forward
  '.koo........ooOk..',
];
// Side: CP profile — dome head, single eye, long orange beak, white belly
const PENGUIN_SIDE_IDLE: Grid = [
  '......kkkk........',
  '....kkvvvvkk......',
  '...kuvvvvvvuk.....',
  '...kuvvvvvvvuk....',
  '..kvvvvvwwwvk.....', // single CP eye
  '..kvvvvvwkwvk.....',
  '..kvvvvvvoOook....', // long orange beak
  '..kvvvvvvooOOok...',
  '.kvvvvvvvvoOook...',
  '.kvvvvvvwwwwvvk...',
  'kvkvvvvwwwwwwvvk..',
  'kvkvvvvwwwwwwvvk..',
  'kvkvvvvwwzzzzvvk..',
  '.kvvvvvwwzzzzvvk..',
  '.kvvvvvwwwwzvvk...',
  '..kvvvvwwwwvVk....',
  '..kvvvvvvvvVk.....',
  '...kVvvvvvVk......',
  '....koo.ook.......', // both feet near plant
  '...kOoo.ooOk......',
];
const PENGUIN_SIDE_0: Grid = [
  '......kkkk........',
  '....kkvvvvkk......',
  '...kuvvvvvvuk.....',
  '...kuvvvvvvvuk....',
  '..kvvvvvwwwvk.....',
  '..kvvvvvwkwvk.....',
  '..kvvvvvvoOook....',
  '..kvvvvvvooOOok...',
  '.kvvvvvvvvoOook...',
  '.kvvvvvvwwwwvvk...',
  'kvkvvvvwwwwwwvvk..',
  'kvkvvvvwwwwwwvvk..',
  'kvkvvvvwwzzzzvvk..',
  '.kvvvvvwwzzzzvvk..',
  '.kvvvvvwwwwzvvk...',
  '..kvvvvwwwwvVk....',
  '..kvvvvvvvvVk.....',
  '...kVvvvvvVk......',
  '....koo.ook.......',
  '...kOoo.ooOk......',
];
const PENGUIN_SIDE_1: Grid = [
  '......kkkk........',
  '....kkvvvvkk......',
  '...kuvvvvvvuk.....',
  '...kuvvvvvvvuk....',
  '..kvvvvvwwwvk.....',
  '..kvvvvvwkwvk.....',
  '..kvvvvvvoOook....',
  '..kvvvvvvooOOok...',
  '.kvvvvvvvvoOook...',
  '.kvvvvvvwwwwvvk...',
  'kvkvvvvwwwwwwvvk..',
  'kvkvvvvwwwwwwvvk..',
  'kvkvvvvwwzzzzvvk..',
  '.kvvvvvwwzzzzvvk..',
  '.kvvvvvwwwwzvvk...',
  '..kvvvvwwwwvVk....',
  '..kvvvvvvvvVk.....',
  '...kVvvvvvVk......',
  '...koo...ook......',
  '..kOoo...ooOk.....',
];

// ---- Penguin clothes (Club Penguin gift-shop classics) ----
// Each overlay is an 18x20 grid aligned to the penguin frames above;
// non-'.' pixels replace the base pixel. Feet rows are never touched, so
// the same overlay works for both walk frames of a facing.
type PenguinOverlay = { down: Grid; up: Grid; side: Grid };

const DOTS = '..................'; // 18 transparent pixels

// Wraps the neck (snug under the chin), with a knit tail that dangles and
// curls off the penguin's left — Cinnamoroll-style, not a flat chest band.
const RED_SCARF_OVERLAY: PenguinOverlay = {
  down: [
    DOTS, DOTS, DOTS, DOTS, DOTS, DOTS, DOTS,
    '.....rrrrrrrr.....',
    '..rrrrrrrrrrrrrr..',
    '..rRr........rRr..',
    '..rrrR............',
    '..RrrrR...........',
    '...RrrrR..........',
    '...RrrrR..........',
    '....RrrR..........',
    '....R.rR..........',
  ],
  up: [
    DOTS, DOTS, DOTS, DOTS, DOTS, DOTS, DOTS, DOTS,
    '..rrrrrrrrrrrrrr..',
    '..rRr.........rr..',
    '..rrrR............',
    '..RrrrR...........',
    '...RrrR...........',
    '...R..R...........',
  ],
  side: [
    DOTS, DOTS, DOTS, DOTS, DOTS, DOTS, DOTS, DOTS,
    '.....rrrrrrrr.....',
    '..rrrrrrrrrrrr....',
    '..rrrR............',
    '..RrrrR...........',
    '..RrrR............',
    '...RrrR...........',
    '...R.rR...........',
  ],
};

const BLUE_TOQUE_OVERLAY: PenguinOverlay = {
  down: [
    '.......kwwk.......',
    '.....kbbbbbbk.....',
    '....kbbbbbbbbk....',
    '...kbBbBbBbBbBk...',
  ],
  up: [
    '.......kwwk.......',
    '.....kbbbbbbk.....',
    '....kbbbbbbbbk....',
    '...kbBbBbBbBbBk...',
  ],
  side: [
    '......kwwk........',
    '....kbbbbbbk......',
    '...kbbbbbbbbk.....',
    '...kbBbBbBbBbk....',
  ],
};

const MINER_HELMET_OVERLAY: PenguinOverlay = {
  down: [
    '.......kyyk.......',
    '.....kyyyyyyk.....',
    '....kyyywwyyyk....',
    '...kYyyyyyyyyYk...',
  ],
  up: [
    '.......kyyk.......',
    '.....kyyyyyyk.....',
    '....kyyyyyyyyk....',
    '...kYyyyyyyyyYk...',
  ],
  side: [
    '......kyyk........',
    '....kyyyyyyk......',
    '...kyyyyyywwk.....',
    '...kYyyyyyyYk.....',
  ],
};

const NINJA_MASK_OVERLAY: PenguinOverlay = {
  down: [
    DOTS, DOTS, DOTS,
    '...kxxxxxxxxxxk...',
    '...kxxxwwxwwxxk...', // align with PENGUIN_DOWN_0 eye columns
    '...kxxxwkwkwxxk...',
  ],
  up: [
    DOTS, DOTS, DOTS,
    '...kxxxxxxxxxxk...',
    '...kxxxxxxxxxxk...',
    '...kxxxxxxxxxxk...',
    '........xx........',
    '.......x..x.......',
  ],
  side: [
    DOTS, DOTS, DOTS,
    '...kxxxxxxxxxk....',
    '..kxxxxxkWWxk.....',
    '..kxxxxxkWkWvk....',
  ],
};

const PIZZA_APRON_OVERLAY: PenguinOverlay = {
  down: [
    DOTS, DOTS, DOTS, DOTS, DOTS, DOTS, DOTS, DOTS,
    '....r........r....',
    '....rrrrrrrrrr....',
    '....rrryyyrrrr....',
    '....rrrryyrrrr....',
    '....rrrrryrrrr....',
    '....RrrrrrrrrR....',
    '.....RrrrrrrR.....',
    '......RRRRRR......',
  ],
  up: [
    DOTS, DOTS, DOTS, DOTS, DOTS, DOTS, DOTS, DOTS,
    '....r........r....',
    '....r........r....',
    '....rrrrrrrrrr....',
    '.......R..R.......',
  ],
  side: [
    DOTS, DOTS, DOTS, DOTS, DOTS, DOTS, DOTS, DOTS, DOTS,
    '........rrrr......',
    '.......rrryyr.....',
    '.......rrryyr.....',
    '.......rrrryr.....',
    '.......rrrrrr.....',
    '.......RrrrR......',
    '.......RRRR.......',
  ],
};

const PENGUIN_CLOTHES: Partial<Record<AccessoryId, PenguinOverlay>> = {
  'red-scarf': RED_SCARF_OVERLAY,
  'blue-toque': BLUE_TOQUE_OVERLAY,
  'miner-helmet': MINER_HELMET_OVERLAY,
  'ninja-mask': NINJA_MASK_OVERLAY,
  'pizza-apron': PIZZA_APRON_OVERLAY,
};

// 12x12 shop/menu icons for the penguin clothes (pet items use PNGs).
const PENGUIN_CLOTHES_ICONS: Partial<Record<AccessoryId, Grid>> = {
  'red-scarf': [
    '............',
    '..kkkkkkkk..',
    '.krrrrrrrrk.',
    '.krRrRrRrrk.',
    '..kkkrrkkk..',
    '....krrk....',
    '....krRk....',
    '....krrk....',
    '....krRk....',
    '....kRRk....',
    '.....kk.....',
    '............',
  ],
  'blue-toque': [
    '............',
    '....kwwk....',
    '....kwwk....',
    '...kbbbbk...',
    '..kbbbbbbk..',
    '.kbbbbbbbbk.',
    '.kbbbbbbbbk.',
    '.kbBbBbBbBk.',
    '.kBbBbBbBbk.',
    '..kkkkkkkk..',
    '............',
    '............',
  ],
  'miner-helmet': [
    '............',
    '....kyyk....',
    '...kyyyyk...',
    '..kyyyyyyk..',
    '..kyywwyyk..',
    '..kyywwyyk..',
    '..kyyyyyyk..',
    '.kYyyyyyyYk.',
    '.kYYYYYYYYk.',
    '..kkkkkkkk..',
    '............',
    '............',
  ],
  'ninja-mask': [
    '............',
    '...kkkkkk...',
    '..kxxxxxxk..',
    '.kxxxxxxxxk.',
    '.kxwwxxwwxk.',
    '.kxwkxxkwxk.',
    '.kxxxxxxxxk.',
    '..kxxxxxxk..',
    '...kkkkkk...',
    '......kxx...',
    '.......kxx..',
    '............',
  ],
  'pizza-apron': [
    '............',
    '...kr..rk...',
    '...kr..rk...',
    '..krrrrrrk..',
    '.krrrrrrrrk.',
    '.krryyyrrrk.',
    '.krrryyrrrk.',
    '.krrrryrrrk.',
    '.kRrrrrrrRk.',
    '..kRRRRRRk..',
    '............',
    '............',
  ],
};

/** Merge an overlay onto a base grid — non-'.' overlay pixels win. */
function overlayGrid(base: Grid, over: Grid): Grid {
  return base.map((row, y) => {
    const orow = over[y];
    if (!orow) return row;
    let out = '';
    for (let x = 0; x < row.length; x++) {
      const ch = orow[x];
      out += ch && ch !== '.' ? ch : row[x];
    }
    return out;
  });
}

/** Apply the equipped penguin clothes to a facing's walk frames. */
function dressPenguin(grids: Grid[], facing: keyof PenguinOverlay): Grid[] {
  const fit = State.data.equippedPenguinAccessories ?? {};
  // Draw order: body, then neck wrap, then headwear on top.
  const order: AccessorySlot[] = ['body', 'extra', 'headLeft', 'headRight'];
  let out = grids;
  for (const slot of order) {
    const id = fit[slot];
    const overlay = id ? PENGUIN_CLOTHES[id] : undefined;
    if (overlay) out = out.map((g) => overlayGrid(g, overlay[facing]));
  }
  return out;
}

// ---- Shopkeeper NPC: cute white bunny with bow (16x16) ----
const BUNNY: Grid = [
  '..kk......kk....',
  '.kWWk....kWWk...',
  '.kWpWk..kWpWk...',
  '.kWpWk..kWpWk...',
  '..kWWkkkkWWk....',
  '..kWWWWWWWWkrr..',
  '.kWWkWWWWkWkrr..',
  '.kWWkWWWWkWWk...',
  '.kWWWWppWWWWk...',
  '..kWWWkkWWWk....',
  '...kWWWWWWk.....',
  '..kWWWWWWWWk....',
  '..kWWWWWWWWk....',
  '..kWWWWWWWWk....',
  '...kWWkkWWk.....',
  '....kk..kk......',
];

// ---- Furniture / items (12x12 unless noted) ----
const PLANT: Grid = [
  '............',
  '....kEEk....',
  '...kEEEEk...',
  '..kEEDEEEk..',
  '..kEEEEDEk..',
  '...kEEEEk...',
  '....kEEk....',
  '....knnk....',
  '...knnnnk...',
  '...kNnnNk...',
  '...kNNNNk...',
  '....kkkk....',
];
const CHAIR: Grid = [
  '............',
  '..knnnnnk...',
  '..knnnnnk...',
  '..knnnnnk...',
  '..knnnnnk...',
  '..knnnnnnk..',
  '..kCCCCCCk..',
  '..knnnnnnk..',
  '..kn....nk..',
  '..kn....nk..',
  '..kN....Nk..',
  '............',
];
const TABLE: Grid = [
  '............',
  '............',
  '.knnnnnnnnk.',
  '.knnnnnnnnk.',
  '.kNnnnnnnNk.',
  '..kn....nk..',
  '..kn....nk..',
  '..kn....nk..',
  '..kN....Nk..',
  '............',
  '............',
  '............',
];
const RUG: Grid = [
  '............',
  '............',
  '.pppppppppp.',
  '.pPPPPPPPPp.',
  '.pPwwwwwwPp.',
  '.pPwppppwPp.',
  '.pPwppppwPp.',
  '.pPwwwwwwPp.',
  '.pPPPPPPPPp.',
  '.pppppppppp.',
  '............',
  '............',
];
const LAMP: Grid = [
  '............',
  '...kyyyyk...',
  '..kyyyyyyk..',
  '..kyyyyyyk..',
  '...kyyyyk...',
  '....ktk.....',
  '....ktk.....',
  '....ktk.....',
  '....ktk.....',
  '...kttk.....',
  '..kttttk....',
  '............',
];
const BED: Grid = [
  '............',
  '.kNNNNNNNNk.',
  '.kNwwNNNNNk.',
  '.kNwwNbbbNk.',
  '.kNNNbbbbNk.',
  '.kNbbbbbbNk.',
  '.kNbbbbbbNk.',
  '.kNNNNNNNNk.',
  '.kN......Nk.',
  '.kN......Nk.',
  '............',
  '............',
];
const BOOKSHELF: Grid = [
  '.knnnnnnnnk.',
  '.knrbyErbnk.',
  '.knrbyErbnk.',
  '.knnnnnnnnk.',
  '.knEyrbbEnk.',
  '.knEyrbbEnk.',
  '.knnnnnnnnk.',
  '.knbrEyyrnk.',
  '.knbrEyyrnk.',
  '.knnnnnnnnk.',
  '.kN......Nk.',
  '............',
];
const TV: Grid = [
  '............',
  '.kxxxxxxxxk.',
  '.kxsssssqxk.',
  '.kxsssssqxk.',
  '.kxsssssqxk.',
  '.kxxxxxxxxk.',
  '....ktk.....',
  '...kttttk...',
  '............',
  '............',
  '............',
  '............',
];
// SVT Lightstick VER.3 Anniversary (Carat Bong): faceted crystal
// diamond head, rose-gold collar, pearl handle.
const LIGHTSTICK: Grid = [
  '....kkkk....',
  '...kWWssk...',
  '..kWsssssk..',
  '..kssWWssk..',
  '...kssssk...',
  '....kssk....',
  '....kppk....',
  '....kWCk....',
  '....kCWk....',
  '....kWCk....',
  '....kppk....',
  '.....kk.....',
];
const FLOWER: Grid = [
  '............',
  '....kPPk....',
  '...kPyyPk...',
  '...kPyyPk...',
  '....kPPk....',
  '.....kEk....',
  '....kEEk....',
  '...kcccck...',
  '...kcccck...',
  '....kcck....',
  '............',
  '............',
];

// ---- World objects (Draft B — snowy island / winter cozy) ----
const TREE: Grid = [
  '................',
  '......kWWk......',
  '.....kWWWWk.....',
  '....kWWEEEWWk...',
  '.....kEEDEEk....',
  '....kEEEEEEEk...',
  '...kEEDEEDEEEk..',
  '....kEEEEEEEk...',
  '...kEWWEEWWEk...',
  '....kEEEEEEEk...',
  '.....kEEEEk.....',
  '......knnk......',
  '......knnk......',
  '.....knnnnk.....',
  '................',
  '................',
];

const BUSH: Grid = [
  '............',
  '............',
  '...kkWWkk...',
  '..kWWEEEWk..',
  '.kWEEDEEWk..',
  '.kEEEEEEEk..',
  '.kEEpPEEEk..',
  '..kEEEEEk...',
  '...kkkkk....',
  '............',
  '............',
  '............',
];

const ROCK: Grid = [
  '............',
  '............',
  '....kkkk....',
  '...kggggk...',
  '..kggWgggk..',
  '..kggggggk..',
  '.kgggggggk..',
  '..kkkkkkkk..',
  '............',
  '............',
  '............',
  '............',
];

const BENCH: Grid = [
  '................',
  '................',
  '.knnnnnnnnnnnnk.',
  '.knCCCCCCCCCCnk.',
  '.knCCCCCCCCCCnk.',
  '.knnnnnnnnnnnnk.',
  '.kN..........Nk.',
  '.kN..........Nk.',
  '.kN..........Nk.',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const STREETLAMP: Grid = [
  '............',
  '....kyyk....',
  '...kyyyyk...',
  '...kyyyyk...',
  '....kyyk....',
  '.....kk.....',
  '.....kr.....',
  '.....kw.....',
  '.....kr.....',
  '.....kw.....',
  '....krrk....',
  '...kwwwwk...',
];

const FENCE: Grid = [
  '................',
  '................',
  '.kC.kC.kC.kC.kC.',
  '.kC.kC.kC.kC.kC.',
  '.kCCCCCCCCCCCCk.',
  '.kC.kC.kC.kC.kC.',
  '.kC.kC.kC.kC.kC.',
  '.kC.kC.kC.kC.kC.',
  '................',
  '................',
  '................',
  '................',
];

const MAILBOX: Grid = [
  '............',
  '...kBBBBBk..',
  '..kBwwwwBk..',
  '..kBwrrwBk..',
  '..kBwwwwBk..',
  '..kBBBBBk...',
  '....knnk....',
  '....knnk....',
  '...knnNNk...',
  '............',
  '............',
  '............',
];

const FOUNTAIN_0: Grid = [
  '................',
  '......kssk......',
  '.....kssWWk.....',
  '....ksssssWk....',
  '.....kbbbbk.....',
  '....kbbssbbk....',
  '...kbbssssbbk...',
  '..kbbssWsssbbk..',
  '..kbbbbbbbbbbk..',
  '...kWWWWWWWWk...',
  '....kkkkkkkk....',
  '................',
  '................',
  '................',
  '................',
  '................',
];

/** Alternate spout height so the fountain can “breathe”. */
const FOUNTAIN_1: Grid = [
  '................',
  '.......ss.......',
  '......kssk......',
  '.....kssWWk.....',
  '....ksssssWk....',
  '.....kbbbbk.....',
  '....kbbssbbk....',
  '...kbbssssbbk...',
  '..kbbssWsssbbk..',
  '..kbbbbbbbbbbk..',
  '...kWWWWWWWWk...',
  '....kkkkkkkk....',
  '................',
  '................',
  '................',
  '................',
];

const SMOKE: Grid = [
  '........',
  '..kggk..',
  '.kggggk.',
  '.kggWgk.',
  '..kggk..',
  '........',
  '........',
  '........',
];

const WILDFLOWER: Grid = [
  '............',
  '..kp..kW..kl',
  '.kPp.kWW.klL',
  '..kp..kW..kl',
  '...s...s...s',
  '....s.s.s...',
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
];

const MUSHROOM: Grid = [
  '............',
  '....krrrk...',
  '...krrWrrk..',
  '..krrrrrrrk.',
  '...kwwwwwk..',
  '....kwwwk...',
  '.....kwk....',
  '.....kwk....',
  '............',
  '............',
  '............',
  '............',
];

const STUMP: Grid = [
  '............',
  '...knnnnnk..',
  '..knCCnCCnk.',
  '..knnnnnnnk.',
  '..kNNNNNNk..',
  '...kNNNNk...',
  '............',
  '............',
  '............',
  '............',
  '............',
  '............',
];

const SIGNPOST: Grid = [
  '............',
  '..kCCCCCCk..',
  '..kCyyyCCk..',
  '..kCCCCCCk..',
  '....knnk....',
  '....knnk....',
  '....knnk....',
  '....knnk....',
  '...knnNNk...',
  '............',
  '............',
  '............',
];

const BARREL: Grid = [
  '............',
  '...knnNNk...',
  '..knCCCCNk..',
  '..knCyyCNk..',
  '..knCCCCNk..',
  '..knCCCCNk..',
  '..knCCCCNk..',
  '...knnNNk...',
  '....kkkk....',
  '............',
  '............',
  '............',
];

const CRATE: Grid = [
  '............',
  '.knnNNNNNnk.',
  '.knCCCCCCnk.',
  '.knCkkkkCnk.',
  '.knCCCCCCnk.',
  '.knCkkkkCnk.',
  '.knCCCCCCnk.',
  '.knnNNNNNnk.',
  '............',
  '............',
  '............',
  '............',
];

const DOCK: Grid = [
  '........................',
  '........................',
  '..knnNNnnNNnnNNnnNNnk...',
  '..knCCCCCCCCCCCCCCCNk...',
  '..knCCCCCCCCCCCCCCCNk...',
  '..knnNNnnNNnnNNnnNNnk...',
  '..kn................Nk..',
  '..kn................Nk..',
  '..kn................Nk..',
  '..knnNNnnNNnnNNnnNNnk...',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
];

const BOBBER: Grid = [
  '........',
  '..krrk..',
  '.krrrrk.',
  '.krWrrk.',
  '.krrrrk.',
  '..kwwk..',
  '...kk...',
  '........',
];

const ROD: Grid = [
  '................',
  '.............kk.',
  '............ktk.',
  '...........ktk..',
  '..........ktk...',
  '.........ktk....',
  '........ktk.....',
  '.......ktk......',
  '......ktk.......',
  '.....knn........',
  '....knnN........',
  '...knn..........',
  '..knn...........',
  '.knn............',
  '................',
  '................',
];

const RIPPLE: Grid = [
  '............',
  '............',
  '...kssssk...',
  '..ks....sk..',
  '.ks......sk.',
  '..ks....sk..',
  '...kssssk...',
  '............',
  '............',
  '............',
  '............',
  '............',
];

/** Common ocean catch — silver-blue. */
const OCEAN_FISH_COMMON: Grid = [
  '............',
  '......k.....',
  '....ktttk...',
  '...ktwwttk..',
  '..kttktttk..',
  '...ktwwttk..',
  '....ktttk...',
  '......k.....',
  '............',
  '............',
  '............',
  '............',
];

/** Uncommon ocean catch — mint green. */
const OCEAN_FISH_UNCOMMON: Grid = [
  '............',
  '......k.....',
  '....keeek...',
  '...keEEeek..',
  '..keeEeeek..',
  '...keEEeek..',
  '....keeek...',
  '......k.....',
  '............',
  '............',
  '............',
  '............',
];

/** Rare ocean catch — warm gold/pink. */
const OCEAN_FISH_RARE: Grid = [
  '............',
  '......k.....',
  '....kyyyk...',
  '...kyPPyyk..',
  '..kyykyyyk..',
  '...kyPPyyk..',
  '....kyyyk...',
  '......k.....',
  '............',
  '............',
  '............',
  '............',
];

const CLOTHES_RACK: Grid = [
  '................',
  '..kt..........tk',
  '..ktttttttttttk.',
  '...k.p..s..P.k..',
  '...k.pp.ss.PP.k.',
  '...k.p..s..P.k..',
  '...k..........k.',
  '...k..........k.',
  '..ktk........ktk',
  '..kttk......kttk',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const HOUSE: Grid = [
  '.......kkkkkkkkkk.......',
  '.....kkWWWWWWWWWWkk.....',
  '....kWWRRRRRRRRRRRWk....',
  '...kWWRRRRRRRRRRRRRWk...',
  '..kWRRRRRRRRRRRRRRRRWk..',
  '.kWRRRRRRRRRRRRRRRRRRWk.',
  '.kkkkkkkkkkkkkkkkkkkkkk.',
  '.kccccccccccccccccccccK.',
  '.kccsskccccccccccksscck.',
  '.kcksskcccccccccckssckk.',
  '.kccccccccNNNNccccccccK.',
  '.kccccccccNnnNccccccccK.',
  '.kccccccccNnnNccccccccK.',
  '.kccccccccNnnNccccccccK.',
  '.kccccccccNnyNccccccccK.',
  '.kkkkkkkkkkNNNkkkkkkkkk.',
];

const SHOP: Grid = [
  '........................',
  '......knnNk.............',
  '......knnNk.............',
  '..kkkkWWWWWWWWWWWWkkkk..',
  '.kPPwwPPwwPPwwPPwwPPwwk.',
  '.kwwPPwwPPwwPPwwPPwwPPk.',
  '..kkkkkkkkkkkkkkkkkkkk..',
  '.kccccccccccccccccccccK.',
  '.kcyyycccccccccccyyycck.',
  '.kcyyycccccccccccyyycck.',
  '.kccccccccccccccccccccK.',
  '.kccccccNNNNNNNNccccccK.',
  '.kccccccNccccccNccccccK.',
  '.kccccccNccccccNccccccK.',
  '.kccccccNccccccNccccccK.',
  '.kkkkkkkkkkkkkkkkkkkkkk.',
];

/** Cafe Cinnamon — cream walls, pink awning, warm door, snow cap. */
const CAFE: Grid = [
  '........................',
  '....kkkkkkkkkkkkkkkk....',
  '...kWWWWWWWWWWWWWWWWk...',
  '..kWWWWppWWWWWppWWWWkk..',
  '.kkkkkkkkkkkkkkkkkkkkkk.',
  '.kPPwwPPwwPPwwPPwwPPwwk.',
  '.kwwPPwwPPwwPPwwPPwwPPk.',
  '.kkkkkkkkkkkkkkkkkkkkkk.',
  '.kccccccccccccccccccccK.',
  '.kccsskccccccccccksscck.',
  '.kcksskcccccccccckssckk.',
  '.kccccccccNNNNNNccccccK.',
  '.kccccccccNmmmmNccccccK.',
  '.kccccccccNmmmmNccccccK.',
  '.kccccccccNmyymNccccccK.',
  '.kkkkkkkkkkNNNNkkkkkkkk.',
];

const ARCADE: Grid = [
  '................',
  '..kkkkkkkkkkkk..',
  '.kLLLLLLLLLLLLk.',
  '.kLlssssssssLLk.',
  '.kLlsyyrbEsslLk.',
  '.kLlssssssssLLk.',
  '.kLLLLLLLLLLLLk.',
  '.kLLlrrllbbLLLk.',
  '.kLLLLLLLLLLLLk.',
  '.kLLLLLLLLLLLLk.',
  '.kLLLLLLLLLLLLk.',
  '..kkkkkkkkkkkk..',
  '................',
  '................',
  '................',
  '................',
];

/** Get rhythm booth — sky-blue cabinet with a gold music note marquee. */
const GET_ARCADE: Grid = [
  '................',
  '..kkkkkkkkkkkk..',
  '.kssssssssssssk.',
  '.ksyyyyyssssssk.',
  '.ksyykkyssssssk.',
  '.ksyykssssssssk.',
  '.ksyykssyyssssk.',
  '.ksyyyyyysssssk.',
  '.kssssssssssssk.',
  '.ksssqqqqqqsssk.',
  '.ksssqqqqqqsssk.',
  '..kkkkkkkkkkkk..',
  '................',
  '................',
  '................',
  '................',
];

/** Outdoor Skip Rope booth — pink canopy + rope post. */
const SKIPROPE_BOOTH: Grid = [
  '................',
  '...kPPPPPPPPk...',
  '..kPppppppppPk..',
  '.kPppyyyyyyppPk.',
  '.kPppyyyyyyppPk.',
  '..kPppppppppPk..',
  '...kkkkkkkkkk...',
  '....n......n....',
  '....n..yy..n....',
  '....n.y..y.n....',
  '....n.y..y.n....',
  '....n..yy..n....',
  '....n......n....',
  '...nnnnnnnnnn...',
  '..nNNNNNNNNNNn..',
  '................',
];

/** Snowy mountain gate for the Sled Run attraction. */
const SLED_HILL: Grid = [
  '................',
  '.......W........',
  '......WWW.......',
  '.....WWWWW......',
  '....WWwwwWW.....',
  '...WWwwwwwWW....',
  '..WWwwLLLwwWW...',
  '.WWwwLLLLLwwWW..',
  'WWwwLLLLLLLwwWW.',
  '...krr....rrk...',
  '...krr....rrk...',
  '..kkkkkkkkkkkk..',
  '..kbbkkkkppkkk..',
  '..kbbkkkkppkkk..',
  '...kkkkkkkkkk...',
  '................',
];

/** Bump arena — red canopy over a tan platform, two sparring blobs. */
const BUMP_ARENA: Grid = [
  '................',
  '...krrrrrrrrk...',
  '..krryyyyyyrrk..',
  '.krryyRRRRyyrrk.',
  '.krryyRRRRyyrrk.',
  '..krryyyyyyrrk..',
  '...kkkkkkkkkk...',
  '................',
  '.....bb..LL.....',
  '....kbbkkLLk....',
  '....kbbkkLLk....',
  '..kCCCCCCCCCCk..',
  '..kCCCCCCCCCCk..',
  '...kNN....NNk...',
  '................',
  '................',
];

/**
 * Expedition booth — canvas-and-easel duelling tent.
 * Reads as "painting / Clair Obscur" without needing Imagine.
 */
const EXPEDITION_BOOTH: Grid = [
  '................',
  '....kWWWWWWk....',
  '...kWyyyyyyWk...',
  '..kWyyRRRRyyWk..',
  '..kWyRRkkRRyWk..',
  '..kWyyRRRRyyWk..',
  '...kWyyyyyyWk...',
  '....kkkkkkkk....',
  '.....n....n.....',
  '.....n.yy.n.....',
  '..kk.n.yR.n.kk..',
  '.kssk.yyyy.kssk.',
  '.ksskkkkkkkkssk.',
  '..kk........kk..',
  '................',
  '................',
];

// ---- Minigame + misc ----
const PAPERBALL: Grid = [
  '........',
  '..kkkk..',
  '.kwwWwk.',
  '.kwWwwk.',
  '.kWwwWk.',
  '.kwwWwk.',
  '..kkkk..',
  '........',
];
const BIN: Grid = [
  '................',
  '.kttttttttttttk.',
  '.ktggggggggggtk.',
  '..ktggggggggtk..',
  '..ktggggggggtk..',
  '..ktggggggggtk..',
  '...ktggggggtk...',
  '...ktggggggtk...',
  '...ktggggggtk...',
  '....kttttttk....',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];
const MUSIC_NOTE_CROTCHET: Grid = [
  '............',
  '.......kk...',
  '......kwk...',
  '......kwk...',
  '......kwk...',
  '......kwk...',
  '......kwk...',
  '......kwk...',
  '..kkkkkwk...',
  '.kwwwwwkk...',
  'kwwwwwwk....',
  'kwwwwwwk....',
  '.kkkkkk.....',
  '............',
];
const MUSIC_NOTE_QUAVER: Grid = [
  '..............',
  '......kkkkk...',
  '......kwwwwk..',
  '......kwwwwk..',
  '......kwkkk...',
  '......kwk.....',
  '......kwk.....',
  '......kwk.....',
  '..kkkkkwk.....',
  '.kwwwwwkk.....',
  'kwwwwwwk......',
  'kwwwwwwk......',
  '.kkkkkk.......',
  '..............',
];
const MUSIC_NOTE_DOUBLE_QUAVER: Grid = [
  '................',
  '..kkkkkkkkkk....',
  '..kwwwwwwwwk....',
  '..kwkkkkkkwk....',
  '..kw......wk....',
  '..kw......wk....',
  '..kw......wk....',
  '..kw......wk....',
  'kkkk....kkkk....',
  'kwwwk...kwwwk...',
  'kwwwwk..kwwwwk..',
  'kwwwwk..kwwwwk..',
  '.kkkk....kkkk...',
  '................',
];
const POOP: Grid = [
  '............',
  '.....kk.....',
  '....kNNk....',
  '...kNNNNk...',
  '..kNNNNNNk..',
  '.kNwNNNNwNk.',
  '.kNNNkkNNNk.',
  'kNNNNNNNNNNk',
  'kkkkkkkkkkkk',
  '............',
];
const CATCH_BOWL: Grid = [
  '......................',
  '......................',
  '.kkkkkkkkkkkkkkkkkkkk.',
  '..kqqqqqqqqqqqqqqqqk..',
  '...kqqqqqqqqqqqqqqk...',
  '....kqqqqqqqqqqqqk....',
  '.....kkkkkkkkkkkk.....',
  '......................',
];
const COIN: Grid = [
  '........',
  '..kkkk..',
  '.kyyyyk.',
  '.kyYYyk.',
  '.kyYYyk.',
  '.kyyyyk.',
  '..kkkk..',
  '........',
];
const FISH: Grid = [
  '........',
  '.....k..',
  '..kkkbk.',
  '.kbbbbk.',
  '.kbkbbk.',
  '..kkkbk.',
  '.....k..',
  '........',
];
const BAIT: Grid = [
  '........',
  '..kk....',
  '.kppk...',
  '..kppk..',
  '...kppk.',
  '....kkk.',
  '.....k..',
  '........',
];
const COOKIE: Grid = [
  '........',
  '..kkkk..',
  '.kCCCCk.',
  '.kCNCCk.',
  '.kCCCNk.',
  '.kCNCCk.',
  '..kkkk..',
  '........',
];
const HEART: Grid = [
  '........',
  '.kk..kk.',
  'kPPkkPPk',
  'kPPPPPPk',
  '.kPPPPk.',
  '..kPPk..',
  '...kk...',
  '........',
];

function drawGrid(ctx: CanvasRenderingContext2D, grid: Grid, ox = 0, oy = 0) {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const ch = grid[y][x];
      if (ch === '.') continue;
      const color = PALETTE[ch];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect((ox + x) * SCALE, (oy + y) * SCALE, SCALE, SCALE);
    }
  }
}

function makeTexture(scene: Phaser.Scene, key: string, grids: Grid[]) {
  // All frames laid out horizontally in one texture; registered as a
  // spritesheet when there is more than one frame.
  const fw = grids[0][0].length;
  const fh = grids[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = fw * grids.length * SCALE;
  canvas.height = fh * SCALE;
  const ctx = canvas.getContext('2d')!;
  grids.forEach((g, i) => drawGrid(ctx, g, i * fw, 0));
  if (grids.length > 1) {
    scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, {
      frameWidth: fw * SCALE,
      frameHeight: fh * SCALE,
    });
  } else {
    scene.textures.addCanvas(key, canvas);
  }
}

// Flat ground tiles: soft base + sparse low-contrast flecks so snow doesn't
// form a harsh grid under large outdoor props.
function makeTile(scene: Phaser.Scene, key: string, base: string, speck: string, speckCount: number, size = 16) {
  const canvas = document.createElement('canvas');
  canvas.width = size * SCALE;
  canvas.height = size * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = speck;
  // deterministic speckle pattern — keep sparse so seams stay invisible
  let seed = key.length * 7 + size;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const flecks = Math.max(3, Math.floor(speckCount * 0.45));
  for (let i = 0; i < flecks; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    // Single logical pixel flecks (not full SCALE blocks) read softer on snow.
    ctx.globalAlpha = 0.35 + rand() * 0.25;
    ctx.fillRect(x * SCALE, y * SCALE, Math.max(1, SCALE - 1), Math.max(1, SCALE - 1));
  }
  ctx.globalAlpha = 1;
  scene.textures.addCanvas(key, canvas);
}

/** Cobblestone plaza tile — irregular grey/tan stones with grout. */
function makeCobbleTile(scene: Phaser.Scene, key: string, size = 16) {
  const canvas = document.createElement('canvas');
  canvas.width = size * SCALE;
  canvas.height = size * SCALE;
  const ctx = canvas.getContext('2d')!;
  const stones = ['#a8a090', '#9a9a92', '#b0a898', '#8e8e86', '#aba498'];
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  ctx.fillStyle = '#6a6860';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cell = 4;
  for (let row = 0; row < size / cell; row++) {
    const ox = row % 2 === 0 ? 0 : 2;
    for (let col = -1; col < size / cell + 1; col++) {
      const px = col * cell + ox;
      const py = row * cell;
      if (px >= size || py >= size) continue;
      ctx.fillStyle = stones[Math.floor(rand() * stones.length)]!;
      const w = Math.min(cell - 1, size - px);
      const h = Math.min(cell - 1, size - py);
      if (w > 0 && h > 0) {
        ctx.fillRect(Math.max(0, px) * SCALE, py * SCALE, w * SCALE, h * SCALE);
      }
    }
  }
  scene.textures.addCanvas(key, canvas);
}

/**
 * Classic on-screen height (20 grid rows × SCALE). Plate textures scale to this.
 * Re-exported from characterScale so NPC and pet heights derive from one number.
 */
export const PENGUIN_DISPLAY_HEIGHT = CHARACTER_PENGUIN_DISPLAY_HEIGHT;
/** Boot loads Imagine plates under this key prefix when present. */
export const PENGUIN_PLATE_KEY = (facing: 'down' | 'up' | 'side', frame: 0 | 1 | 2) =>
  `penguin-plate-${facing}-${frame}`;
/** Raised-flipper wave poses; frame 0 of the wave is the idle down plate. */
export const PENGUIN_WAVE_PLATE_KEY = (frame: 1 | 2 | 3) => `penguin-plate-wave-${frame}`;
const PENGUIN_WAVE_PLATE_FRAMES = [1, 2, 3] as const;
/**
 * Classic Club Penguin dance spritesheet (76 GIF frames, 10-col grid).
 * Built by `npm run sprite:penguin-dance` from the Tenor reference GIF.
 */
export const PENGUIN_DANCE_SHEET_KEY = 'penguin-plate-dance-sheet';
/** Must match `DANCE_FRAME_COUNT` / sheet packing in scripts/penguin-dance-plates.mts. */
export const PENGUIN_DANCE_FRAME_COUNT = 76;
export const PENGUIN_DANCE_SHEET_COLS = 10;

const PENGUIN_FACINGS = ['down', 'up', 'side'] as const;
/** 0 = idle plant (stop); 1–2 = alternating mid-stride walk. */
const PENGUIN_FRAME_COUNT = 3;

/** True when Boot preloaded Imagine plate frames for the player penguin. */
export function hasPenguinPlates(scene: Phaser.Scene): boolean {
  return PENGUIN_FACINGS.every((facing) =>
    ([0, 1, 2] as const).every((frame) => scene.textures.exists(PENGUIN_PLATE_KEY(facing, frame))),
  );
}

/** True when Boot preloaded the plate-resolution wave poses. */
export function hasPenguinWavePlates(scene: Phaser.Scene): boolean {
  return (
    hasPenguinPlates(scene) &&
    PENGUIN_WAVE_PLATE_FRAMES.every((frame) => scene.textures.exists(PENGUIN_WAVE_PLATE_KEY(frame)))
  );
}

/** True when Boot preloaded the dance spritesheet. */
export function hasPenguinDanceSheet(scene: Phaser.Scene): boolean {
  return scene.textures.exists(PENGUIN_DANCE_SHEET_KEY);
}

/**
 * Phaser scale so plate textures draw at classic penguin height.
 * Classic 18×20×SCALE canvases are already at display size → scale 1.
 */
export function penguinDrawScale(scene: Phaser.Scene): number {
  if (!scene.textures.exists('penguin-down')) return 1;
  const h = scene.textures.getFrame('penguin-down')?.height ?? 0;
  if (h <= 64) return 1;
  return PENGUIN_DISPLAY_HEIGHT / h;
}

/** Classic penguin geometry: 54×60 canvas, foot collider 34×16 @ (10,42). */
const CLASSIC_BOX_WIDTH = 54;
const CLASSIC_BOX_HEIGHT = 60;
const CLASSIC_COLLIDER_WIDTH = 34;
const CLASSIC_COLLIDER_HEIGHT = 16;
const CLASSIC_COLLIDER_X = 10;
const CLASSIC_COLLIDER_Y = 42;

/**
 * How far below a penguin sprite's y its feet are planted. Every pose aligns to
 * this, so ground markers do not need to know which pose is showing.
 */
export const PENGUIN_FEET_BELOW_CENTRE =
  PENGUIN_DISPLAY_HEIGHT * IDLE_FEET_BELOW_CENTRE_RATIO;

/**
 * Scale for dance frames. Cell height is the wrong yardstick here: the walk
 * plate is packed tight around its penguin while the dance cell reserves a
 * third of its height for the floor spin, so reusing `penguinDrawScale`'s
 * rule draws the dancer ~38% short. Match the drawn body instead.
 */
export function penguinDanceDrawScale(frameHeight: number): number {
  const standHeight = frameHeight * DANCE_STAND_HEIGHT_RATIO;
  if (standHeight <= 0) return 1;
  return (PENGUIN_DISPLAY_HEIGHT * IDLE_BODY_HEIGHT_RATIO) / standHeight;
}

/**
 * Origin that plants the standing pose's feet exactly where the idle penguin's
 * are. Centring the cell instead would leave the dancer hovering, because its
 * feet sit well above the middle of the cell.
 */
export function penguinDanceOriginY(frameHeight: number): number {
  if (frameHeight <= 0) return 0.5;
  const scale = penguinDanceDrawScale(frameHeight);
  const feet = frameHeight * DANCE_STAND_FEET_RATIO;
  return (feet - (PENGUIN_DISPLAY_HEIGHT * IDLE_FEET_BELOW_CENTRE_RATIO) / scale) / frameHeight;
}

/**
 * True when this texture is a dance sheet (local `penguin-dance` or a per-colour
 * remote one). Read from the sprite rather than tracked separately: world scenes
 * reset the walk plate every frame and the dance pose is re-applied after, so a
 * caller's "is dancing" flag can disagree with what is actually drawn.
 */
export function isPenguinDanceTexture(key: string): boolean {
  return key === LOCAL_PENGUIN_DANCE_TEXTURE_KEY || key.endsWith('-dance');
}

/**
 * How far above a penguin sprite's y the drawn head reaches, for whichever pose
 * is currently showing. Labels anchor to this instead of `displayHeight`, which
 * counts the dance cell's empty floor-spin margin and drifts as poses change.
 */
export function penguinHeadAboveCentre(
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
): number {
  if (!isPenguinDanceTexture(sprite.texture.key)) return PENGUIN_DISPLAY_HEIGHT / 2;
  const fh = sprite.frame.height;
  const scale = penguinDanceDrawScale(fh);
  return (penguinDanceOriginY(fh) - DANCE_STAND_TOP_RATIO) * fh * scale;
}

/**
 * Y-sort a penguin by where its feet stand, whatever pose is showing. Sorting on
 * the raw sprite box would jump when the dance sheet swaps in, because its cell
 * reserves empty rows below the feet for the floor spin.
 */
export function penguinDepthTarget(sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite): {
  y: number;
  displayHeight: number;
  originY: number;
} {
  return { y: sprite.y + PENGUIN_FEET_BELOW_CENTRE, displayHeight: 0, originY: 0 };
}

/**
 * Apply plate-aware scale + foot collider to the player sprite.
 * Classic textures: 54×60, body (34×16) @ offset (10,42).
 *
 * Arcade `setSize`/`setOffset` use **source** (unscaled) frame pixels; Phaser
 * then scales the body with the sprite. Do not pass displayWidth/displayHeight
 * or the collider is double-scaled.
 */
export function configurePlayerPenguin(
  sprite: Phaser.Physics.Arcade.Sprite | Phaser.GameObjects.Sprite,
) {
  const scale = penguinDrawScale(sprite.scene);
  sprite.setScale(scale);
  // Dance borrows the origin to plant its feet; every other pose is centred.
  sprite.setOrigin(0.5, 0.5);
  if (!sprite.body || !(sprite.body instanceof Phaser.Physics.Arcade.Body)) return;
  const fw = sprite.frame.width;
  const fh = sprite.frame.height;
  // Same proportions as classic 34×16 / 54×60, in source pixels.
  sprite.body
    .setSize(
      fw * (CLASSIC_COLLIDER_WIDTH / CLASSIC_BOX_WIDTH),
      fh * (CLASSIC_COLLIDER_HEIGHT / CLASSIC_BOX_HEIGHT),
    )
    .setOffset(
      fw * (CLASSIC_COLLIDER_X / CLASSIC_BOX_WIDTH),
      fh * (CLASSIC_COLLIDER_Y / CLASSIC_BOX_HEIGHT),
    );
}

/**
 * Point a penguin sprite at the dance sheet: its cells carry their own scale and
 * origin, and the collider has to be re-pinned in dance pixels or it inflates
 * with the sprite and starts shoving whatever the dancer is standing next to.
 */
export function configureDancePenguin(
  sprite: Phaser.Physics.Arcade.Sprite | Phaser.GameObjects.Sprite,
) {
  const fw = sprite.frame.width;
  const fh = sprite.frame.height;
  const scale = penguinDanceDrawScale(fh);
  const originY = penguinDanceOriginY(fh);
  sprite.setScale(scale);
  sprite.setOrigin(0.5, originY);
  if (!sprite.body || !(sprite.body instanceof Phaser.Physics.Arcade.Body)) return;
  // Same world-space collider as the idle plate, expressed in dance pixels.
  sprite.body
    .setSize(CLASSIC_COLLIDER_WIDTH / scale, CLASSIC_COLLIDER_HEIGHT / scale)
    .setOffset(
      fw / 2 - (CLASSIC_BOX_WIDTH / 2 - CLASSIC_COLLIDER_X) / scale,
      originY * fh + (CLASSIC_COLLIDER_Y - CLASSIC_BOX_HEIGHT / 2) / scale,
    );
}

/** Is this pixel part of the recolourable blue body (not outline/belly/beak/feet)? */
function isPenguinBodyBlue(r: number, g: number, b: number, a: number): boolean {
  if (a < 20) return false;
  // Outline / near-black
  if (r + g + b < 90) return false;
  // White / grey belly
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 28 && r > 150) return false;
  // Orange beak / feet
  if (r > 160 && g > 70 && g < 210 && b < 110 && r > b + 40) return false;
  // Body blue / cyan (dominant blue channel)
  return b > 90 && b >= g - 5 && b > r + 10;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Recolour plate body blues toward the active palette (v / V / u). */
function recolorPenguinPlateData(
  data: Uint8ClampedArray,
  body: [number, number, number],
  shade: [number, number, number],
  hi: [number, number, number],
) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    const a = data[i + 3]!;
    if (!isPenguinBodyBlue(r, g, b, a)) continue;
    const lum = (r + g + b) / (3 * 255);
    // Map lightness into body / highlight / shade of the chosen colourway.
    let dest = body;
    if (lum > 0.55) dest = hi;
    else if (lum < 0.32) dest = shade;
    data[i] = dest[0];
    data[i + 1] = dest[1];
    data[i + 2] = dest[2];
  }
}

/** Stamp clothes overlays (18×20 grids) onto a plate-sized frame. */
function stampClothesOnPlate(
  ctx: CanvasRenderingContext2D,
  facing: keyof PenguinOverlay,
  frameW: number,
  frameH: number,
) {
  const fit = State.data.equippedPenguinAccessories ?? {};
  const order: AccessorySlot[] = ['body', 'extra', 'headLeft', 'headRight'];
  const cellW = frameW / 18;
  const cellH = frameH / 20;
  for (const slot of order) {
    const id = fit[slot];
    const overlay = id ? PENGUIN_CLOTHES[id] : undefined;
    if (!overlay) continue;
    const grid = overlay[facing];
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y]!;
      for (let x = 0; x < row.length; x++) {
        const ch = row[x]!;
        if (ch === '.') continue;
        const color = PALETTE[ch];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW), Math.ceil(cellH));
      }
    }
  }
}

/**
 * Build penguin-down/up/side spritesheets from Imagine plate textures
 * (Boot preloads `penguin-plate-*`). Keeps plate resolution; nearest filter.
 *
 * Sheet frames: 0 = idle plant (stop), 1–2 = alternating walk strides.
 * Walk anims use frames 1↔2 so the cycle never hops on one foot.
 */
function makePenguinFromPlates(scene: Phaser.Scene) {
  const body = hexToRgb(PALETTE.v!);
  const shade = hexToRgb(PALETTE.V!);
  const hi = hexToRgb(PALETTE.u!);

  for (const facing of PENGUIN_FACINGS) {
    const key0 = PENGUIN_PLATE_KEY(facing, 0);
    const src0 = scene.textures.get(key0).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const fw = (src0 as HTMLImageElement).width || (src0 as HTMLCanvasElement).width;
    const fh = (src0 as HTMLImageElement).height || (src0 as HTMLCanvasElement).height;
    const sheet = document.createElement('canvas');
    sheet.width = fw * PENGUIN_FRAME_COUNT;
    sheet.height = fh;
    const sctx = sheet.getContext('2d')!;

    for (let frame = 0; frame < PENGUIN_FRAME_COUNT; frame++) {
      const srcKey = PENGUIN_PLATE_KEY(facing, frame as 0 | 1 | 2);
      const srcImg = scene.textures.get(srcKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const tmp = document.createElement('canvas');
      tmp.width = fw;
      tmp.height = fh;
      const tctx = tmp.getContext('2d')!;
      tctx.drawImage(srcImg as CanvasImageSource, 0, 0, fw, fh);
      const imgData = tctx.getImageData(0, 0, fw, fh);
      recolorPenguinPlateData(imgData.data, body, shade, hi);
      tctx.putImageData(imgData, 0, 0);
      stampClothesOnPlate(tctx, facing, fw, fh);
      sctx.drawImage(tmp, frame * fw, 0);
    }

    if (scene.textures.exists(`penguin-${facing}`)) scene.textures.remove(`penguin-${facing}`);
    scene.textures.addSpriteSheet(`penguin-${facing}`, sheet as unknown as HTMLImageElement, {
      frameWidth: fw,
      frameHeight: fh,
    });
    scene.textures.get(`penguin-${facing}`).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  const anims = scene.anims;
  for (const key of ['walk-down', 'walk-up', 'walk-side'] as const) {
    if (anims.exists(key)) anims.remove(key);
  }
  // Walk cycles frames 1↔2 (alternating feet). Frame 0 is idle plant for stop.
  anims.create({
    key: 'walk-down',
    frames: anims.generateFrameNumbers('penguin-down', { start: 1, end: 2 }),
    frameRate: 6,
    repeat: -1,
  });
  anims.create({
    key: 'walk-up',
    frames: anims.generateFrameNumbers('penguin-up', { start: 1, end: 2 }),
    frameRate: 6,
    repeat: -1,
  });
  anims.create({
    key: 'walk-side',
    frames: anims.generateFrameNumbers('penguin-side', { start: 1, end: 2 }),
    frameRate: 6,
    repeat: -1,
  });
}

/**
 * Wave spritesheet from Imagine plates: frame 0 is the idle down plate, 1–3 the
 * raised-flipper plates. Same source art, same resolution and recolour/clothes
 * pipeline as the walk sheets, so the flipper lifts instead of the sprite
 * dissolving into 26px blocks.
 */
function makeWaveTextureFromPlates(
  scene: Phaser.Scene,
  key: string,
  color: string,
  includeClothes: boolean,
) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const palette = PENGUIN_COLORS[normalizePenguinColor(color)] ?? PENGUIN_COLORS.blue!;
  const body = hexToRgb(palette.v);
  const shade = hexToRgb(palette.V);
  const hi = hexToRgb(palette.u);
  const frameKeys = [
    PENGUIN_PLATE_KEY('down', 0),
    ...PENGUIN_WAVE_PLATE_FRAMES.map((frame) => PENGUIN_WAVE_PLATE_KEY(frame)),
  ];
  const first = scene.textures.get(frameKeys[0]!).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const fw = first.width;
  const fh = first.height;
  const sheet = document.createElement('canvas');
  sheet.width = fw * frameKeys.length;
  sheet.height = fh;
  const sctx = sheet.getContext('2d')!;
  const previous = { v: PALETTE.v!, V: PALETTE.V!, u: PALETTE.u! };
  setPenguinPalette(normalizePenguinColor(color));
  frameKeys.forEach((frameKey, index) => {
    const source = scene.textures.get(frameKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const tmp = document.createElement('canvas');
    tmp.width = fw;
    tmp.height = fh;
    const tctx = tmp.getContext('2d')!;
    tctx.imageSmoothingEnabled = false;
    tctx.drawImage(source as CanvasImageSource, 0, 0, fw, fh);
    const image = tctx.getImageData(0, 0, fw, fh);
    recolorPenguinPlateData(image.data, body, shade, hi);
    tctx.putImageData(image, 0, 0);
    if (includeClothes) stampClothesOnPlate(tctx, 'down', fw, fh);
    sctx.drawImage(tmp, index * fw, 0);
  });
  Object.assign(PALETTE, previous);
  scene.textures.addSpriteSheet(key, sheet as unknown as HTMLImageElement, {
    frameWidth: fw,
    frameHeight: fh,
  });
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Plate wave poses when Boot loaded them; hand-authored grids otherwise. */
function makeWaveTexture(
  scene: Phaser.Scene,
  key: string,
  color: string,
  referenceKey: string,
  includeClothes: boolean,
) {
  if (hasPenguinWavePlates(scene)) {
    makeWaveTextureFromPlates(scene, key, color, includeClothes);
    return;
  }
  makeAuthoredWaveTexture(scene, key, color, referenceKey, includeClothes);
}

/**
 * Dance spritesheet from the Club Penguin GIF (76 frames, multi-row grid).
 * Recolours body blues for the active colourway. Clothes are skipped: spin and
 * tumble frames have no stable down-facing attach points.
 */
function makeDanceTextureFromSheet(scene: Phaser.Scene, key: string, color: string) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  if (!hasPenguinDanceSheet(scene)) return;
  const palette = PENGUIN_COLORS[normalizePenguinColor(color)] ?? PENGUIN_COLORS.blue!;
  const body = hexToRgb(palette.v);
  const shade = hexToRgb(palette.V);
  const hi = hexToRgb(palette.u);
  const source = scene.textures.get(PENGUIN_DANCE_SHEET_KEY).getSourceImage() as
    | HTMLImageElement
    | HTMLCanvasElement;
  const sheetW = source.width;
  const sheetH = source.height;
  const cols = PENGUIN_DANCE_SHEET_COLS;
  const rows = Math.ceil(PENGUIN_DANCE_FRAME_COUNT / cols);
  const fw = Math.floor(sheetW / cols);
  const fh = Math.floor(sheetH / rows);
  if (fw < 8 || fh < 8) return;

  const canvas = document.createElement('canvas');
  canvas.width = sheetW;
  canvas.height = sheetH;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source as CanvasImageSource, 0, 0, sheetW, sheetH);
  const image = ctx.getImageData(0, 0, sheetW, sheetH);
  recolorPenguinPlateData(image.data, body, shade, hi);
  ctx.putImageData(image, 0, 0);

  scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, {
    frameWidth: fw,
    frameHeight: fh,
    endFrame: PENGUIN_DANCE_FRAME_COUNT - 1,
  });
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

function makeDanceTexture(scene: Phaser.Scene, key: string, color: string, _includeClothes: boolean) {
  makeDanceTextureFromSheet(scene, key, color);
}

function makeAuthoredWaveTexture(
  scene: Phaser.Scene,
  key: string,
  color: string,
  referenceKey: string,
  includeClothes: boolean,
) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const frame = scene.textures.getFrame(referenceKey);
  const frameW = frame?.width ?? 18 * SCALE;
  const frameH = frame?.height ?? 20 * SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = frameW * PENGUIN_WAVE_GRIDS.length;
  canvas.height = frameH;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const previous = { v: PALETTE.v!, V: PALETTE.V!, u: PALETTE.u! };
  setPenguinPalette(color);
  const cellW = frameW / 18;
  const cellH = frameH / 20;
  PENGUIN_WAVE_GRIDS.forEach((grid, index) => {
    const offsetX = index * frameW;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y]!.length; x++) {
        const paletteColor = PALETTE[grid[y]![x]!];
        if (!paletteColor) continue;
        ctx.fillStyle = paletteColor;
        ctx.fillRect(offsetX + Math.floor(x * cellW), Math.floor(y * cellH), Math.ceil(cellW), Math.ceil(cellH));
      }
    }
    if (includeClothes) {
      ctx.save();
      ctx.translate(offsetX, 0);
      stampClothesOnPlate(ctx, 'down', frameW, frameH);
      ctx.restore();
    }
  });
  Object.assign(PALETTE, previous);
  scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, {
    frameWidth: frameW,
    frameHeight: frameH,
  });
  scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/** Build unaccessorized, colour-specific textures and walk anims for a remote player. */
export function ensureRemotePenguinTextures(scene: Phaser.Scene, requestedColor: string) {
  const color = normalizePenguinColor(requestedColor);
  if (scene.textures.exists(remotePenguinTextureKey('down', color))) return;
  const palette = PENGUIN_COLORS[color] ?? PENGUIN_COLORS.blue;

  if (!hasPenguinPlates(scene)) {
    const previous = { v: PALETTE.v!, V: PALETTE.V!, u: PALETTE.u! };
    setPenguinPalette(color);
    makeTexture(scene, remotePenguinTextureKey('down', color), [PENGUIN_DOWN_IDLE, PENGUIN_DOWN_0, PENGUIN_DOWN_1]);
    makeTexture(scene, remotePenguinTextureKey('up', color), [PENGUIN_UP_IDLE, PENGUIN_UP_0, PENGUIN_UP_1]);
    makeTexture(scene, remotePenguinTextureKey('side', color), [PENGUIN_SIDE_IDLE, PENGUIN_SIDE_0, PENGUIN_SIDE_1]);
    Object.assign(PALETTE, previous);
  } else {
    const body = hexToRgb(palette.v);
    const shade = hexToRgb(palette.V);
    const hi = hexToRgb(palette.u);
    for (const facing of PENGUIN_FACINGS) {
      const source = scene.textures.get(PENGUIN_PLATE_KEY(facing, 0)).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const width = source.width;
      const height = source.height;
      const canvas = document.createElement('canvas');
      canvas.width = width * PENGUIN_FRAME_COUNT;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      for (let index = 0; index < PENGUIN_FRAME_COUNT; index++) {
        const frameSource = scene.textures
          .get(PENGUIN_PLATE_KEY(facing, index as 0 | 1 | 2))
          .getSourceImage() as HTMLImageElement | HTMLCanvasElement;
        ctx.drawImage(frameSource as CanvasImageSource, index * width, 0, width, height);
        const image = ctx.getImageData(index * width, 0, width, height);
        recolorPenguinPlateData(image.data, body, shade, hi);
        ctx.putImageData(image, index * width, 0);
      }
      const key = remotePenguinTextureKey(facing, color);
      scene.textures.addSpriteSheet(key, canvas as unknown as HTMLImageElement, {
        frameWidth: width,
        frameHeight: height,
      });
      scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  }

  for (const facing of PENGUIN_FACINGS) {
    const animKey = remotePenguinWalkAnimKey(facing, color);
    if (!scene.anims.exists(animKey)) {
      scene.anims.create({
        key: animKey,
        frames: scene.anims.generateFrameNumbers(remotePenguinTextureKey(facing, color), { start: 1, end: 2 }),
        frameRate: 6,
        repeat: -1,
      });
    }
  }
  makeWaveTexture(
    scene,
    remotePenguinWaveTextureKey(color),
    color,
    remotePenguinTextureKey('down', color),
    false,
  );
  makeDanceTexture(scene, remotePenguinDanceTextureKey(color), color, false);
}

function makePenguin(scene: Phaser.Scene) {
  if (hasPenguinPlates(scene)) {
    makePenguinFromPlates(scene);
    makeWaveTexture(
      scene,
      LOCAL_PENGUIN_WAVE_TEXTURE_KEY,
      State.data.penguinColor ?? 'blue',
      'penguin-down',
      true,
    );
    makeDanceTexture(scene, LOCAL_PENGUIN_DANCE_TEXTURE_KEY, State.data.penguinColor ?? 'blue', true);
    return;
  }
  // Classic 18×20 grid fallback (pre-plate path): idle plant + 2 walk strides.
  makeTexture(scene, 'penguin-down', dressPenguin([PENGUIN_DOWN_IDLE, PENGUIN_DOWN_0, PENGUIN_DOWN_1], 'down'));
  makeTexture(scene, 'penguin-up', dressPenguin([PENGUIN_UP_IDLE, PENGUIN_UP_0, PENGUIN_UP_1], 'up'));
  makeTexture(scene, 'penguin-side', dressPenguin([PENGUIN_SIDE_IDLE, PENGUIN_SIDE_0, PENGUIN_SIDE_1], 'side'));
  const anims = scene.anims;
  if (!anims.exists('walk-down')) {
    anims.create({ key: 'walk-down', frames: anims.generateFrameNumbers('penguin-down', { start: 1, end: 2 }), frameRate: 6, repeat: -1 });
    anims.create({ key: 'walk-up', frames: anims.generateFrameNumbers('penguin-up', { start: 1, end: 2 }), frameRate: 6, repeat: -1 });
    anims.create({ key: 'walk-side', frames: anims.generateFrameNumbers('penguin-side', { start: 1, end: 2 }), frameRate: 6, repeat: -1 });
  }
  makeWaveTexture(
    scene,
    LOCAL_PENGUIN_WAVE_TEXTURE_KEY,
    State.data.penguinColor ?? 'blue',
    'penguin-down',
    true,
  );
  makeDanceTexture(scene, LOCAL_PENGUIN_DANCE_TEXTURE_KEY, State.data.penguinColor ?? 'blue', true);
}

const PENGUIN_TEXTURE_KEYS = [
  'penguin-down',
  'penguin-up',
  'penguin-side',
  LOCAL_PENGUIN_WAVE_TEXTURE_KEY,
  LOCAL_PENGUIN_DANCE_TEXTURE_KEY,
];

/**
 * Rebuild the penguin textures + walk anims (after a colourway or outfit
 * change) and re-point any live sprites at the fresh textures.
 */
export function refreshPenguin(scene: Phaser.Scene) {
  // Live sprites keep a reference to the destroyed texture — remember them
  // before the rebuild so they can be re-pointed at the fresh one.
  const wearers: [Phaser.GameObjects.Sprite, string][] = [];
  for (const obj of scene.children.list) {
    if (obj instanceof Phaser.GameObjects.Sprite && PENGUIN_TEXTURE_KEYS.includes(obj.texture?.key)) {
      wearers.push([obj, obj.texture.key]);
    }
  }
  for (const key of PENGUIN_TEXTURE_KEYS) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }
  for (const key of ['walk-down', 'walk-up', 'walk-side']) {
    if (scene.anims.exists(key)) scene.anims.remove(key);
  }
  makePenguin(scene);
  for (const [sprite, key] of wearers) {
    sprite.setTexture(key, 0);
    if (sprite instanceof Phaser.Physics.Arcade.Sprite) configurePlayerPenguin(sprite);
    else sprite.setScale(penguinDrawScale(scene));
  }
}

/** Swap the penguin's colourway and rebuild its textures + walk anims. */
export function applyPenguinColor(scene: Phaser.Scene, color: string) {
  setPenguinPalette(color);
  refreshPenguin(scene);
}

export function generateTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists('penguin-down')) {
    setPenguinPalette(State.data.penguinColor ?? 'blue');
    makePenguin(scene);
    for (const [id, grid] of Object.entries(PENGUIN_CLOTHES_ICONS)) {
      makeTexture(scene, ACCESSORIES[id as AccessoryId].texture, [grid as Grid]);
    }
    makeTexture(scene, 'bunny', [BUNNY]);
    // Outdoor props may already be Imagine PNGs from BootScene — never clobber.
    if (!scene.textures.exists('tree')) makeTexture(scene, 'tree', [TREE]);
    if (!scene.textures.exists('house')) makeTexture(scene, 'house', [HOUSE]);
    if (!scene.textures.exists('cafe')) makeTexture(scene, 'cafe', [CAFE]);
    if (!scene.textures.exists('arcade')) makeTexture(scene, 'arcade', [ARCADE]);
    if (!scene.textures.exists('get-arcade')) makeTexture(scene, 'get-arcade', [GET_ARCADE]);
    if (!scene.textures.exists('skiprope-booth')) makeTexture(scene, 'skiprope-booth', [SKIPROPE_BOOTH]);
    if (!scene.textures.exists('sled-hill')) makeTexture(scene, 'sled-hill', [SLED_HILL]);
    if (!scene.textures.exists('expedition-booth')) makeTexture(scene, 'expedition-booth', [EXPEDITION_BOOTH]);
    makeTexture(scene, 'paperball', [PAPERBALL]);
    makeTexture(scene, 'bin', [BIN]);
    makeTexture(scene, 'music-note-crotchet', [MUSIC_NOTE_CROTCHET]);
    makeTexture(scene, 'music-note-quaver', [MUSIC_NOTE_QUAVER]);
    makeTexture(scene, 'music-note-double-quaver', [MUSIC_NOTE_DOUBLE_QUAVER]);
    makeTexture(scene, 'poop', [POOP]);
    makeTexture(scene, 'catch-bowl', [CATCH_BOWL]);
    makeTexture(scene, 'coin', [COIN]);
    makeTexture(scene, 'fish', [FISH]);
    makeTexture(scene, 'bait', [BAIT]);
    makeTexture(scene, 'cookie', [COOKIE]);
    makeTexture(scene, 'heart', [HEART]);

    makeTexture(scene, 'item-plant', [PLANT]);
    makeTexture(scene, 'item-chair', [CHAIR]);
    makeTexture(scene, 'item-table', [TABLE]);
    makeTexture(scene, 'item-rug', [RUG]);
    makeTexture(scene, 'item-lamp', [LAMP]);
    makeTexture(scene, 'item-bed', [BED]);
    makeTexture(scene, 'item-bookshelf', [BOOKSHELF]);
    makeTexture(scene, 'item-tv', [TV]);
    makeTexture(scene, 'item-flower', [FLOWER]);
    makeTexture(scene, 'item-lightstick', [LIGHTSTICK]);

    // Winter ground tiles (soft flecks — remade every cold start with penguin).
    if (!scene.textures.exists('tile-grass')) makeTile(scene, 'tile-grass', '#e9f1f8', '#dfeaf3', 10);
    if (!scene.textures.exists('tile-path')) makeTile(scene, 'tile-path', '#c5dcf0', '#b4d0e8', 8);
    if (!scene.textures.exists('tile-floor')) makeTile(scene, 'tile-floor', '#d9b380', '#c9a06a', 8);
    if (!scene.textures.exists('tile-wall')) makeTile(scene, 'tile-wall', '#b085c9', '#9e6fbc', 6);
    if (!scene.textures.exists('tile-snow')) makeTile(scene, 'tile-snow', '#f2f6fa', '#e8eef5', 8);
  }

  if (!scene.textures.exists('cafe')) makeTexture(scene, 'cafe', [CAFE]);
  if (!scene.textures.exists('get-arcade')) makeTexture(scene, 'get-arcade', [GET_ARCADE]);
  if (!scene.textures.exists('music-note-crotchet')) {
    makeTexture(scene, 'music-note-crotchet', [MUSIC_NOTE_CROTCHET]);
  }
  if (!scene.textures.exists('music-note-quaver')) {
    makeTexture(scene, 'music-note-quaver', [MUSIC_NOTE_QUAVER]);
  }
  if (!scene.textures.exists('music-note-double-quaver')) {
    makeTexture(scene, 'music-note-double-quaver', [MUSIC_NOTE_DOUBLE_QUAVER]);
  }
  if (!scene.textures.exists('poop')) makeTexture(scene, 'poop', [POOP]);
  if (!scene.textures.exists('catch-bowl')) makeTexture(scene, 'catch-bowl', [CATCH_BOWL]);
  if (!scene.textures.exists('skiprope-booth')) makeTexture(scene, 'skiprope-booth', [SKIPROPE_BOOTH]);
  if (!scene.textures.exists('sled-hill')) makeTexture(scene, 'sled-hill', [SLED_HILL]);

  // Outdoor tiles / buildings / props: create only when missing. Never remove
  // shared keys while live Game Objects may still reference them (scenes call
  // generateTextures on every enter). Winter palette is baked into the grids
  // and makeTile colors below — a full reload picks them up after art changes.
  const ensureTile = (key: string, a: string, b: string, n: number) => {
    if (!scene.textures.exists(key)) makeTile(scene, key, a, b, n);
  };
  // Soft winter palette — low contrast flecks so ground doesn't "stack" under props.
  ensureTile('tile-grass', '#e9f1f8', '#dfeaf3', 10);
  ensureTile('tile-path', '#c5dcf0', '#b4d0e8', 8);
  ensureTile('tile-plaza', '#d2e4f4', '#c3daf0', 6);
  ensureTile('tile-snow', '#f2f6fa', '#e8eef5', 8);
  ensureTile('tile-sand', '#e8e4da', '#ddd6ca', 10);
  ensureTile('tile-ocean', '#4a8fbf', '#3a7aa8', 10);
  ensureTile('tile-ocean2', '#5a9dcb', '#4689b6', 10);

  if (!scene.textures.exists('house')) makeTexture(scene, 'house', [HOUSE]);
  if (!scene.textures.exists('shop')) makeTexture(scene, 'shop', [SHOP]);
  if (!scene.textures.exists('cafe')) makeTexture(scene, 'cafe', [CAFE]);
  if (!scene.textures.exists('tree')) makeTexture(scene, 'tree', [TREE]);
  if (!scene.textures.exists('fountain')) {
    makeTexture(scene, 'fountain', [FOUNTAIN_0, FOUNTAIN_1]);
  }
  // Only animate multi-frame grid fountains. Imagine PNG is a single still.
  if (!scene.anims.exists('fountain-splash') && scene.textures.exists('fountain')) {
    const frameTotal = scene.textures.get('fountain').frameTotal;
    if (frameTotal > 1) {
      scene.anims.create({
        key: 'fountain-splash',
        frames: scene.anims.generateFrameNumbers('fountain', { start: 0, end: 1 }),
        frameRate: 2.5,
        repeat: -1,
      });
    }
  }

  const outdoor: [string, Grid][] = [
    ['bush', BUSH],
    ['rock', ROCK],
    ['bench', BENCH],
    ['streetlamp', STREETLAMP],
    ['fence', FENCE],
    ['mailbox', MAILBOX],
    ['wildflower', WILDFLOWER],
    ['mushroom', MUSHROOM],
    ['stump', STUMP],
    ['signpost', SIGNPOST],
    ['barrel', BARREL],
    ['crate', CRATE],
    ['dock', DOCK],
    ['bobber', BOBBER],
    ['rod', ROD],
    ['ripple', RIPPLE],
    ['smoke', SMOKE],
    ['oceanfish-common', OCEAN_FISH_COMMON],
    ['oceanfish-uncommon', OCEAN_FISH_UNCOMMON],
    ['oceanfish-rare', OCEAN_FISH_RARE],
    ['clothes-rack', CLOTHES_RACK],
    ['bump-arena', BUMP_ARENA],
    ['expedition-booth', EXPEDITION_BOOTH],
  ];
  for (const [key, grid] of outdoor) {
    if (!scene.textures.exists(key)) makeTexture(scene, key, [grid]);
  }
}
