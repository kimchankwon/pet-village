import Phaser from 'phaser';
import { ACCESSORIES, type AccessoryId, type AccessorySlot } from '../systems/accessories';
import { State } from '../systems/GameState';

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
const PENGUIN_DOWN_0: Grid = [
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
  '....koo....ook....',
  '...kOoo....ooOk...',
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
  '...koo......ook...',
  '..kOoo......ooOk..',
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
  '....koo....ook....',
  '...kOoo....ooOk...',
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
  '...koo......ook...',
  '..kOoo......ooOk..',
];
// Side: CP profile — dome head, single eye, long orange beak, white belly
const PENGUIN_SIDE_0: Grid = [
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

// ---- World objects ----
const TREE: Grid = [
  '................',
  '.....kkkkk......',
  '...kkEEEEEkk....',
  '..kEEEEEEEEEk...',
  '..kEEDEEEDEEk...',
  '.kEEEEEEEEEEEk..',
  '.kEDEEEEEEEDEk..',
  '.kEEEEEDEEEEEk..',
  '..kEEEEEEEEEk...',
  '...kkEEEEEkk....',
  '.....kkkkk......',
  '......knnk......',
  '......knnk......',
  '.....knnnnk.....',
  '................',
  '................',
];

const BUSH: Grid = [
  '............',
  '............',
  '...kkkkk....',
  '..kEEEEEk...',
  '.kEDEEEDEk..',
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
  '.....kt.....',
  '.....kt.....',
  '.....kt.....',
  '.....kt.....',
  '....kttk....',
  '...kttttk...',
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
  '.....kssssk.....',
  '....kssssssk....',
  '.....kbbbbk.....',
  '....kbbssbbk....',
  '...kbbssssbbk...',
  '..kbbssssssbbk..',
  '..kbbbbbbbbbbk..',
  '...kggggggggk...',
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
  '.....kssssk.....',
  '....kssssssk....',
  '.....kbbbbk.....',
  '....kbbssbbk....',
  '...kbbssssbbk...',
  '..kbbssssssbbk..',
  '..kbbbbbbbbbbk..',
  '...kggggggggk...',
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
  '..kp..ky..kl',
  '.kPp.kyy.klL',
  '..kp..ky..kl',
  '...E...E...E',
  '....E.E.E...',
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
  '.....kkRRRRRRRRRRkk.....',
  '....kRRRRRRRRRRRRRRk....',
  '...kRRRRRRRRRRRRRRRRk...',
  '..kRRRRRRRRRRRRRRRRRRk..',
  '.kRRRRRRRRRRRRRRRRRRRRk.',
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
  '..kkkkkkkkkkkkkkkkkkkk..',
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

/** Cafe Cinnamon — cream walls, pink awning, warm door. */
const CAFE: Grid = [
  '........................',
  '....kkkkkkkkkkkkkkkk....',
  '...kWWWWWWWWWWWWWWWWk...',
  '..kWWppWWWWWWWWppWWWk..',
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

// Simple flat-color tiles with a touch of noise for texture.
function makeTile(scene: Phaser.Scene, key: string, base: string, speck: string, speckCount: number, size = 16) {
  const canvas = document.createElement('canvas');
  canvas.width = size * SCALE;
  canvas.height = size * SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = speck;
  // deterministic speckle pattern
  let seed = key.length * 7 + size;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < speckCount; i++) {
    const x = Math.floor(rand() * size);
    const y = Math.floor(rand() * size);
    ctx.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
  }
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

/** Classic on-screen height (20 grid rows × SCALE). Plate textures scale to this. */
export const PENGUIN_DISPLAY_HEIGHT = 20 * SCALE;
/** Boot loads Imagine plates under this key prefix when present. */
export const PENGUIN_PLATE_KEY = (facing: 'down' | 'up' | 'side', frame: 0 | 1) =>
  `penguin-plate-${facing}-${frame}`;

const PENGUIN_FACINGS = ['down', 'up', 'side'] as const;

/** True when Boot preloaded Imagine plate frames for the player penguin. */
export function hasPenguinPlates(scene: Phaser.Scene): boolean {
  return PENGUIN_FACINGS.every((facing) => scene.textures.exists(PENGUIN_PLATE_KEY(facing, 0)));
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
  if (!sprite.body || !(sprite.body instanceof Phaser.Physics.Arcade.Body)) return;
  const fw = sprite.frame.width;
  const fh = sprite.frame.height;
  // Same proportions as classic 34×16 / 54×60, in source pixels.
  sprite.body
    .setSize(fw * (34 / 54), fh * (16 / 60))
    .setOffset(fw * (10 / 54), fh * (42 / 60));
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
    sheet.width = fw * 2;
    sheet.height = fh;
    const sctx = sheet.getContext('2d')!;

    for (let frame = 0; frame < 2; frame++) {
      const srcKey = PENGUIN_PLATE_KEY(facing, frame as 0 | 1);
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
  anims.create({
    key: 'walk-down',
    frames: anims.generateFrameNumbers('penguin-down', { start: 0, end: 1 }),
    frameRate: 6,
    repeat: -1,
  });
  anims.create({
    key: 'walk-up',
    frames: anims.generateFrameNumbers('penguin-up', { start: 0, end: 1 }),
    frameRate: 6,
    repeat: -1,
  });
  anims.create({
    key: 'walk-side',
    frames: anims.generateFrameNumbers('penguin-side', { start: 0, end: 1 }),
    frameRate: 6,
    repeat: -1,
  });
}

function makePenguin(scene: Phaser.Scene) {
  if (hasPenguinPlates(scene)) {
    makePenguinFromPlates(scene);
    return;
  }
  // Classic 18×20 grid fallback (pre-plate path).
  makeTexture(scene, 'penguin-down', dressPenguin([PENGUIN_DOWN_0, PENGUIN_DOWN_1], 'down'));
  makeTexture(scene, 'penguin-up', dressPenguin([PENGUIN_UP_0, PENGUIN_UP_1], 'up'));
  makeTexture(scene, 'penguin-side', dressPenguin([PENGUIN_SIDE_0, PENGUIN_SIDE_1], 'side'));
  const anims = scene.anims;
  if (!anims.exists('walk-down')) {
    anims.create({ key: 'walk-down', frames: anims.generateFrameNumbers('penguin-down', { start: 0, end: 1 }), frameRate: 6, repeat: -1 });
    anims.create({ key: 'walk-up', frames: anims.generateFrameNumbers('penguin-up', { start: 0, end: 1 }), frameRate: 6, repeat: -1 });
    anims.create({ key: 'walk-side', frames: anims.generateFrameNumbers('penguin-side', { start: 0, end: 1 }), frameRate: 6, repeat: -1 });
  }
}

const PENGUIN_TEXTURE_KEYS = ['penguin-down', 'penguin-up', 'penguin-side'];

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
    makeTexture(scene, 'tree', [TREE]);
    makeTexture(scene, 'house', [HOUSE]);
    makeTexture(scene, 'cafe', [CAFE]);
    makeTexture(scene, 'arcade', [ARCADE]);
    makeTexture(scene, 'get-arcade', [GET_ARCADE]);
    if (!scene.textures.exists('skiprope-booth')) makeTexture(scene, 'skiprope-booth', [SKIPROPE_BOOTH]);
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

    makeTile(scene, 'tile-grass', '#7ec850', '#6ab53f', 14);
    makeTile(scene, 'tile-path', '#e0c9a6', '#cdb28a', 10);
    makeTile(scene, 'tile-floor', '#d9b380', '#c9a06a', 8);
    makeTile(scene, 'tile-wall', '#b085c9', '#9e6fbc', 6);
    makeTile(scene, 'tile-snow', '#eef3f8', '#dde7f0', 8);
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

  if (scene.textures.exists('tile-plaza')) scene.textures.remove('tile-plaza');
  // Smooth stone plaza (not brick cobble).
  makeTile(scene, 'tile-plaza', '#c8c2b6', '#b8b2a6', 5);
  if (!scene.textures.exists('tile-sand')) makeTile(scene, 'tile-sand', '#e8d4a8', '#d4bc88', 12);
  if (!scene.textures.exists('tile-ocean')) makeTile(scene, 'tile-ocean', '#3a8fd4', '#2e7ab8', 10);
  if (!scene.textures.exists('tile-ocean2')) makeTile(scene, 'tile-ocean2', '#4599dc', '#3484c4', 10);

  // Shop + fountain regenerate so chimney / water frames pick up on hot reload.
  if (scene.textures.exists('shop')) scene.textures.remove('shop');
  makeTexture(scene, 'shop', [SHOP]);
  if (scene.textures.exists('fountain')) scene.textures.remove('fountain');
  if (scene.anims.exists('fountain-splash')) scene.anims.remove('fountain-splash');
  makeTexture(scene, 'fountain', [FOUNTAIN_0, FOUNTAIN_1]);
  scene.anims.create({
    key: 'fountain-splash',
    frames: scene.anims.generateFrameNumbers('fountain', { start: 0, end: 1 }),
    frameRate: 2.5,
    repeat: -1,
  });

  // Outdoor décor — ensure on every call so hot reloads pick up new props.
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
  ];
  for (const [key, grid] of outdoor) {
    if (!scene.textures.exists(key)) makeTexture(scene, key, [grid]);
  }
}
