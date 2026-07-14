export type ClassicSpecies = 'mametchi' | 'kuchipatchi' | 'mimitchi' | 'violetchi';
export type PuffleColor =
  | 'blue'
  | 'pink'
  | 'green'
  | 'black'
  | 'purple'
  | 'red'
  | 'yellow'
  | 'white'
  | 'orange'
  | 'brown';
export type PetSpecies = ClassicSpecies | `puffle-${PuffleColor}` | 'bongbongee' | 'cinnamoroll' | 'kirby';

export const PUFFLE_COLORS: PuffleColor[] = [
  'blue',
  'pink',
  'green',
  'black',
  'purple',
  'red',
  'yellow',
  'white',
  'orange',
  'brown',
];

type PetDef = {
  id: PetSpecies;
  label: string;
  defaultName: string;
  blurb: string;
  group: 'classic' | 'puffle' | 'mascot';
};

const CLASSIC: PetDef[] = [
  {
    id: 'mametchi',
    label: 'Mametchi',
    defaultName: 'Mochi',
    blurb: 'Curious inventor · loves gadgets',
    group: 'classic',
  },
  {
    id: 'kuchipatchi',
    label: 'Kuchipatchi',
    defaultName: 'Patchi',
    blurb: 'Easygoing daydreamer · loves Tama-Donuts',
    group: 'classic',
  },
  {
    id: 'mimitchi',
    label: 'Mimitchi',
    defaultName: 'Mimi',
    blurb: 'Cheerful & caring · perfect-care pal',
    group: 'classic',
  },
  {
    id: 'violetchi',
    label: 'Violetchi',
    defaultName: 'Petal',
    blurb: 'Gentle gardener · speaks flower',
    group: 'classic',
  },
];

const PUFFLE_META: Record<PuffleColor, { label: string; defaultName: string; blurb: string }> = {
  blue: { label: 'Blue Puffle', defaultName: 'Bluey', blurb: 'Loyal · loves to play' },
  pink: { label: 'Pink Puffle', defaultName: 'Pinkie', blurb: 'Cheerful · loves dancing' },
  green: { label: 'Green Puffle', defaultName: 'Gogo', blurb: 'Zany · loves tricks' },
  black: { label: 'Black Puffle', defaultName: 'Shadow', blurb: 'Grumpy · secretly soft' },
  purple: { label: 'Purple Puffle', defaultName: 'Violet', blurb: 'Dramatic · loves attention' },
  red: { label: 'Red Puffle', defaultName: 'Rusty', blurb: 'Sporty · loves rolling' },
  yellow: { label: 'Yellow Puffle', defaultName: 'Sunny', blurb: 'Silly · loves jokes' },
  white: { label: 'White Puffle', defaultName: 'Snowy', blurb: 'Shy · loves quiet' },
  orange: { label: 'Orange Puffle', defaultName: 'Ozzie', blurb: 'Goofy · curly tuft & buck teeth' },
  brown: { label: 'Brown Puffle', defaultName: 'Bruno', blurb: 'Inventor · loves goggles' },
};

const PUFFLES: PetDef[] = PUFFLE_COLORS.map((color) => ({
  id: `puffle-${color}` as PetSpecies,
  label: PUFFLE_META[color].label,
  defaultName: PUFFLE_META[color].defaultName,
  blurb: PUFFLE_META[color].blurb,
  group: 'puffle' as const,
}));

const MASCOT: PetDef[] = [
  {
    id: 'bongbongee',
    label: 'Bongbongee',
    defaultName: 'Bong',
    blurb: 'SEVENTEEN CARAT mascot · loves sparkles',
    group: 'mascot',
  },
  {
    id: 'cinnamoroll',
    label: 'Cinnamoroll',
    defaultName: 'Cinna',
    blurb: 'Fluffy cafe pup · naps on laps',
    group: 'mascot',
  },
  {
    id: 'kirby',
    label: 'Kirby',
    defaultName: 'Poyo',
    blurb: 'Pink puffball · eats everything',
    group: 'mascot',
  },
];

export const PET_SPECIES: Record<PetSpecies, PetDef> = Object.fromEntries(
  [...CLASSIC, ...PUFFLES, ...MASCOT].map((d) => [d.id, d]),
) as Record<PetSpecies, PetDef>;

export const PET_SPECIES_LIST = Object.values(PET_SPECIES);
export const CLASSIC_PETS = CLASSIC;
export const PUFFLE_PETS = PUFFLES;
export const MASCOT_PETS = MASCOT;

/** File stem under public/assets/pet/<species>/ */
export const PET_ASSET_FILES = [
  'neutral1',
  'neutral2',
  'walk1',
  'walk2',
  'sad',
  'happy',
  'sleep',
  'jump',
] as const;

export type PetPose =
  | 'idle1'
  | 'idle2'
  | 'walk1'
  | 'walk2'
  | 'walk3'
  | 'walk4'
  | 'walk5'
  | 'walk6'
  | 'walk7'
  | 'walk8'
  | 'sad'
  | 'happy'
  | 'sleep'
  | 'jump';

const FILE_TO_POSE: Record<(typeof PET_ASSET_FILES)[number], PetPose> = {
  neutral1: 'idle1',
  neutral2: 'idle2',
  walk1: 'walk1',
  walk2: 'walk2',
  sad: 'sad',
  happy: 'happy',
  sleep: 'sleep',
  jump: 'jump',
};

/** Kirby’s GBA-style walk uses an 8-frame cycle (extra frames beyond the shared walk1/walk2). */
export const KIRBY_WALK_FILES = [
  'walk1',
  'walk2',
  'walk3',
  'walk4',
  'walk5',
  'walk6',
  'walk7',
  'walk8',
] as const;

export function petTextureKey(species: PetSpecies, pose: PetPose): string {
  return `${species}-${pose}`;
}

export function petAnimKey(species: PetSpecies, kind: 'bounce' | 'walk'): string {
  return `${species}-${kind}`;
}

export function petAssetPath(species: PetSpecies, file: (typeof PET_ASSET_FILES)[number]): string {
  return `assets/pet/${species}/${file}.png`;
}

export function poseFromAssetFile(file: (typeof PET_ASSET_FILES)[number]): PetPose {
  return FILE_TO_POSE[file];
}

export function isPetSpecies(value: unknown): value is PetSpecies {
  return typeof value === 'string' && value in PET_SPECIES;
}

export function isPuffleSpecies(value: unknown): value is `puffle-${PuffleColor}` {
  return typeof value === 'string' && value.startsWith('puffle-') && value in PET_SPECIES;
}

const CLASSIC_SPECIES = new Set<string>(CLASSIC.map((d) => d.id));

export function isClassicSpecies(value: unknown): value is ClassicSpecies {
  return typeof value === 'string' && CLASSIC_SPECIES.has(value);
}

export const petSpeciesValidatorLiterals = [
  'mametchi',
  'kuchipatchi',
  'mimitchi',
  'violetchi',
  'bongbongee',
  'cinnamoroll',
  'kirby',
  ...PUFFLE_COLORS.map((c) => `puffle-${c}`),
] as const;
