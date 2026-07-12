import { State } from '../systems/GameState';

// Pixel-art textures generated at runtime from character grids.
// Each sprite is an array of strings; each character maps to a palette color,
// '.' is transparent. Everything renders at SCALE px per pixel-art pixel.
// To use real image assets later, replace generateTextures() with loader calls
// that register the same texture keys.

export const SCALE = 3;

const PALETTE: Record<string, string> = {
  k: '#1a1a2e', // outline / near-black
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
  ['blue', 'Blue', '#006090'],
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
  ['lightblue', 'Light Blue', '#0090c0'],
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
// Club Penguin-style: pear navy body, big white belly with soft shade,
// high oval eyes + black pupils, bright orange beak + flat feet, side flippers.
const PENGUIN_DOWN_0: Grid = [
  '.......kkkk.......',
  '.....kkvvvvkk.....',
  '....kuvvvvvvuk....',
  '...kuvvvvvvvvuk...',
  '...kvWWWvvWWWvk...',
  '...kvWkWvvWkWvk...',
  '..kvvvvoOOoovvvk..',
  '..kvvvooOOOovvvk..',
  '.kvvvwwwwwwwwvvvk.',
  'kvkvwwwwwwwwwwvkvk',
  'kvkvwwwwwwwwwwvkvk',
  'kvkvwwwwwwwwwwvkvk',
  'kvkvwwzzzzzzwwvkvk',
  '.kvvwwzzzzzzwwvvk.',
  '.kvvvwwzzzzwwvvvk.',
  '..kvvvvwwwwvvvvk..',
  '...kVvvvvvvvvVk...',
  '....kVvvvvvvVk....',
  '...koo......ook...',
  '..kOoo......ooOk..',
];
const PENGUIN_DOWN_1: Grid = [
  '.......kkkk.......',
  '.....kkvvvvkk.....',
  '....kuvvvvvvuk....',
  '...kuvvvvvvvvuk...',
  '...kvWWWvvWWWvk...',
  '...kvWkWvvWkWvk...',
  '..kvvvvoOOoovvvk..',
  '..kvvvooOOOovvvk..',
  '.kvvvwwwwwwwwvvvk.',
  'kvkvwwwwwwwwwwvkvk',
  'kvkvwwwwwwwwwwvkvk',
  'kvkvwwwwwwwwwwvkvk',
  'kvkvwwzzzzzzwwvkvk',
  '.kvvwwzzzzzzwwvvk.',
  '.kvvvwwzzzzwwvvvk.',
  '..kvvvvwwwwvvvvk..',
  '...kVvvvvvvvvVk...',
  '....kVvvvvvvVk....',
  '..koo........ook..',
  '.kOoo........ooOk.',
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
  '.kvvvvvvvvvvvvvvk.',
  'kvkvvvvvvvvvvvvkvk',
  'kvkvvvvvvvvvvvvkvk',
  'kvkvvvvvvvvvvvvkvk',
  'kvkvVvvvvvvvvVVkvk',
  '.kvvVvvvvvvvvVvk..',
  '.kvvvVvvvvvvVvvvk.',
  '..kvvvvVVVVvvvvk..',
  '...kVvvvvvvvvVk...',
  '....kVvvvvvvVk....',
  '...koo......ook...',
  '..kOoo......ooOk..',
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
  '.kvvvvvvvvvvvvvvk.',
  'kvkvvvvvvvvvvvvkvk',
  'kvkvvvvvvvvvvvvkvk',
  'kvkvvvvvvvvvvvvkvk',
  'kvkvVvvvvvvvvVVkvk',
  '.kvvVvvvvvvvvVvk..',
  '.kvvvVvvvvvvVvvvk.',
  '..kvvvvVVVVvvvvk..',
  '...kVvvvvvvvvVk...',
  '....kVvvvvvvVk....',
  '..koo........ook..',
  '.kOoo........ooOk.',
];
const PENGUIN_SIDE_0: Grid = [
  '......kkkk........',
  '....kkvvvvkk......',
  '...kuvvvvvvuk.....',
  '...kuvvvvvvvuk....',
  '..kvvvvvkWWWvk....',
  '..kvvvvvkWkWvk....',
  '..kvvvvvvoOook....',
  '..kvvvvvvooOOok...',
  '.kvvvvvvvvoOook...',
  '.kvvvvvvwwwwvvk...',
  'kvkvvvvwwwwwwvvk..',
  'kvkvvvvwwzzzzvvk..',
  'kvkvvvvwwzzzzvvk..',
  '.kvvvvvwwzzzzvvk..',
  '.kvvvvvwwzzzvvk...',
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
  '..kvvvvvkWWWvk....',
  '..kvvvvvkWkWvk....',
  '..kvvvvvvoOook....',
  '..kvvvvvvooOOok...',
  '.kvvvvvvvvoOook...',
  '.kvvvvvvwwwwvvk...',
  'kvkvvvvwwwwwwvvk..',
  'kvkvvvvwwzzzzvvk..',
  'kvkvvvvwwzzzzvvk..',
  '.kvvvvvwwzzzzvvk..',
  '.kvvvvvwwzzzvvk...',
  '..kvvvvwwwwvVk....',
  '..kvvvvvvvvVk.....',
  '...kVvvvvvVk......',
  '...koo...ook......',
  '..kOoo...ooOk.....',
];

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

const FOUNTAIN: Grid = [
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

function makePenguin(scene: Phaser.Scene) {
  makeTexture(scene, 'penguin-down', [PENGUIN_DOWN_0, PENGUIN_DOWN_1]);
  makeTexture(scene, 'penguin-up', [PENGUIN_UP_0, PENGUIN_UP_1]);
  makeTexture(scene, 'penguin-side', [PENGUIN_SIDE_0, PENGUIN_SIDE_1]);
  const anims = scene.anims;
  if (!anims.exists('walk-down')) {
    anims.create({ key: 'walk-down', frames: anims.generateFrameNumbers('penguin-down', { start: 0, end: 1 }), frameRate: 6, repeat: -1 });
    anims.create({ key: 'walk-up', frames: anims.generateFrameNumbers('penguin-up', { start: 0, end: 1 }), frameRate: 6, repeat: -1 });
    anims.create({ key: 'walk-side', frames: anims.generateFrameNumbers('penguin-side', { start: 0, end: 1 }), frameRate: 6, repeat: -1 });
  }
}

/** Swap the penguin's colourway and rebuild its textures + walk anims. */
export function applyPenguinColor(scene: Phaser.Scene, color: string) {
  setPenguinPalette(color);
  for (const key of ['penguin-down', 'penguin-up', 'penguin-side']) {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  }
  for (const key of ['walk-down', 'walk-up', 'walk-side']) {
    if (scene.anims.exists(key)) scene.anims.remove(key);
  }
  makePenguin(scene);
}

export function generateTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists('penguin-down')) {
    setPenguinPalette(State.data.penguinColor ?? 'blue');
    makePenguin(scene);
    makeTexture(scene, 'bunny', [BUNNY]);
    makeTexture(scene, 'tree', [TREE]);
    makeTexture(scene, 'house', [HOUSE]);
    makeTexture(scene, 'shop', [SHOP]);
    makeTexture(scene, 'cafe', [CAFE]);
    makeTexture(scene, 'arcade', [ARCADE]);
    makeTexture(scene, 'paperball', [PAPERBALL]);
    makeTexture(scene, 'bin', [BIN]);
    makeTexture(scene, 'coin', [COIN]);
    makeTexture(scene, 'fish', [FISH]);
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

  // Outdoor décor — ensure on every call so hot reloads pick up new props.
  const outdoor: [string, Grid][] = [
    ['bush', BUSH],
    ['rock', ROCK],
    ['bench', BENCH],
    ['streetlamp', STREETLAMP],
    ['fence', FENCE],
    ['mailbox', MAILBOX],
    ['fountain', FOUNTAIN],
    ['wildflower', WILDFLOWER],
    ['mushroom', MUSHROOM],
    ['stump', STUMP],
    ['signpost', SIGNPOST],
    ['clothes-rack', CLOTHES_RACK],
  ];
  for (const [key, grid] of outdoor) {
    if (!scene.textures.exists(key)) makeTexture(scene, key, [grid]);
  }
}
