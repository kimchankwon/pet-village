/**
 * Equippable clothes — Bongbongee outfits (sold at Cafe Cinnamon),
 * Cinnamoroll cafe + puffle dig finds, plus Club Penguin-style gear only
 * the player's penguin can wear.
 *
 * Pet overlays are authored on a 32×32 canvas (same native space as classic
 * pet plates). Phaser scale must use PET display height / 32, not the pet
 * texture's own scale — hi-res plates like Kirby would otherwise shrink
 * clothes to a tiny speck.
 */

export type AccessorySlot = 'headLeft' | 'headRight' | 'body' | 'extra';

/** Classic overlay canvas size accessories are drawn against. */
export const ACCESSORY_CANVAS = 32;

export const PENGUIN_ACCESSORY_IDS = [
  'red-scarf',
  'blue-toque',
  'miner-helmet',
  'ninja-mask',
  'pizza-apron',
] as const;

export type PenguinAccessoryId = (typeof PENGUIN_ACCESSORY_IDS)[number];

export type AccessoryId =
  // Bongbongee — Imagine-authored set that fits the pink-cap diamond plush
  | 'aqua-clip'
  | 'mint-puff'
  | 'diamond-tee'
  | 'carat-sash'
  // Cinnamoroll cafe
  | 'cloud-bow'
  | 'ear-cloud'
  | 'cafe-apron'
  | 'cinnamon-scarf'
  // Puffle dig
  | 'puffle-tee'
  | 'puffle-cape'
  | 'feather-boa'
  | 'propeller-hat'
  | 'newspaper-hat'
  | 'snorkel'
  | 'glam-glasses'
  | 'brown-goggles'
  | 'big-sunglasses'
  | PenguinAccessoryId
  // Pet boutique
  | 'chef-toque'
  | 'star-band'
  | 'top-bow'
  | 'kirby-bowtie'
  | 'mini-crown'
  | 'ribbon-tie';

export type AccessorySource =
  | 'bongbongee'
  | 'cinnamoroll'
  | 'puffle-dig'
  | 'penguin-shop'
  | 'pet-boutique';

/**
 * Who may wear this item. Defaults from `owner` when omitted
 * (`puffle-dig` → puffles; `penguin-shop` → the player's penguin;
 * otherwise the owner mascot). Boutique items set `wearable` explicitly.
 */
export type AccessoryWearable =
  | 'bongbongee'
  | 'cinnamoroll'
  | 'puffle'
  | 'penguin'
  | 'kirby'
  | 'classic';

export interface AccessoryDef {
  id: AccessoryId;
  name: string;
  blurb: string;
  slot: AccessorySlot;
  /** Phaser texture key (loaded in Boot). */
  texture: string;
  /** Who provides this item. */
  owner: AccessorySource;
  /** Coin price when sold. Gifts omit this. */
  price?: number;
  /** Restrict equip to a pet family. Omit to derive from `owner`. */
  wearable?: AccessoryWearable;
}

/** Resolved wear rule for an accessory. */
export function accessoryWearable(def: AccessoryDef): AccessoryWearable {
  if (def.wearable) return def.wearable;
  if (def.owner === 'puffle-dig') return 'puffle';
  if (def.owner === 'penguin-shop') return 'penguin';
  // 'pet-boutique' items always declare `wearable` explicitly (handled above);
  // the remaining owners map straight to their mascot family.
  if (def.owner === 'bongbongee' || def.owner === 'cinnamoroll') return def.owner;
  return 'classic';
}

export const ACCESSORIES: Record<AccessoryId, AccessoryDef> = {
  // Bongbongee — sold at Cafe Cinnamon (not gifted by the town NPC).
  'aqua-clip': {
    id: 'aqua-clip',
    name: 'Aqua Gem Clip',
    blurb: 'Crystal diamond clip · sits on the pink cap',
    slot: 'headLeft',
    texture: 'acc-aqua-clip',
    owner: 'bongbongee',
    price: 22,
    wearable: 'bongbongee',
  },
  'mint-puff': {
    id: 'mint-puff',
    name: 'Mint Cap Puff',
    blurb: 'Fluffy mint pom · right of the pink cap',
    slot: 'headRight',
    texture: 'acc-mint-puff',
    owner: 'bongbongee',
    price: 18,
    wearable: 'bongbongee',
  },
  'diamond-tee': {
    id: 'diamond-tee',
    name: 'Diamond Tee',
    blurb: 'Baby-blue soft tee with a little diamond badge',
    slot: 'body',
    texture: 'acc-diamond-tee',
    owner: 'bongbongee',
    price: 26,
    wearable: 'bongbongee',
  },
  'carat-sash': {
    id: 'carat-sash',
    name: 'Carat Sash',
    blurb: 'Aqua-and-pink sash with a diamond charm',
    slot: 'extra',
    texture: 'acc-carat-sash',
    owner: 'bongbongee',
    price: 24,
    wearable: 'bongbongee',
  },
  'cloud-bow': {
    id: 'cloud-bow',
    name: 'Cloud Bow',
    blurb: 'Soft pink bow · smells like pastry steam',
    slot: 'headLeft',
    texture: 'acc-cloud-bow',
    owner: 'cinnamoroll',
    price: 18,
    wearable: 'cinnamoroll',
  },
  'ear-cloud': {
    id: 'ear-cloud',
    name: 'Ear Cloud',
    blurb: 'Tiny sky puff · floats like Cinna’s ears',
    slot: 'headRight',
    texture: 'acc-ear-cloud',
    owner: 'cinnamoroll',
    price: 16,
    wearable: 'cinnamoroll',
  },
  'cafe-apron': {
    id: 'cafe-apron',
    name: 'Cafe Apron',
    blurb: 'Cafe Cinnamon apron · ready to help',
    slot: 'body',
    texture: 'acc-cafe-apron',
    owner: 'cinnamoroll',
    price: 28,
    wearable: 'cinnamoroll',
  },
  'cinnamon-scarf': {
    id: 'cinnamon-scarf',
    name: 'Cinnamon Scarf',
    blurb: 'Warm swirl scarf · like a cinnamon roll',
    slot: 'extra',
    texture: 'acc-cinnamon-scarf',
    owner: 'cinnamoroll',
    price: 22,
    wearable: 'cinnamoroll',
  },
  // Mine Shack–style puffle dig finds (puffles only)
  'puffle-tee': {
    id: 'puffle-tee',
    name: 'Puffle Tee',
    blurb: 'Classic dig-list puffle shirt',
    slot: 'body',
    texture: 'acc-puffle-tee',
    owner: 'puffle-dig',
    price: 20,
    wearable: 'puffle',
  },
  'puffle-cape': {
    id: 'puffle-cape',
    name: 'Puffle Cape',
    blurb: 'Hero cape · every colour has one',
    slot: 'extra',
    texture: 'acc-puffle-cape',
    owner: 'puffle-dig',
    price: 26,
    wearable: 'puffle',
  },
  'feather-boa': {
    id: 'feather-boa',
    name: 'Feather Boa',
    blurb: 'Fabulous dig-list fluff',
    slot: 'extra',
    texture: 'acc-feather-boa',
    owner: 'puffle-dig',
    price: 24,
    wearable: 'puffle',
  },
  'propeller-hat': {
    id: 'propeller-hat',
    name: 'Propeller Hat',
    blurb: 'Green dig find · spin spin',
    slot: 'headLeft',
    texture: 'acc-propeller-hat',
    owner: 'puffle-dig',
    price: 22,
    wearable: 'puffle',
  },
  'newspaper-hat': {
    id: 'newspaper-hat',
    name: 'Newspaper Hat',
    blurb: 'Blue dig find · origami chic',
    slot: 'headLeft',
    texture: 'acc-newspaper-hat',
    owner: 'puffle-dig',
    price: 14,
    wearable: 'puffle',
  },
  snorkel: {
    id: 'snorkel',
    name: 'Green Snorkel',
    blurb: 'Pink dig find · ready to dive',
    slot: 'headLeft',
    texture: 'acc-snorkel',
    owner: 'puffle-dig',
    price: 18,
    wearable: 'puffle',
  },
  'glam-glasses': {
    id: 'glam-glasses',
    name: 'Glam Glasses',
    blurb: 'Purple dig find · star frames',
    slot: 'headRight',
    texture: 'acc-glam-glasses',
    owner: 'puffle-dig',
    price: 22,
    wearable: 'puffle',
  },
  'brown-goggles': {
    id: 'brown-goggles',
    name: 'Lab Goggles',
    blurb: 'Brown puffle’s red-rim specs',
    slot: 'headRight',
    texture: 'acc-brown-goggles',
    owner: 'puffle-dig',
    price: 20,
    wearable: 'puffle',
  },
  'big-sunglasses': {
    id: 'big-sunglasses',
    name: 'Giant Sunglasses',
    blurb: 'White dig find · snow-blind cool',
    slot: 'headRight',
    texture: 'acc-big-sunglasses',
    owner: 'puffle-dig',
    price: 18,
    wearable: 'puffle',
  },
  // Gift Shop classics — worn by the player's penguin, never the pets.
  'red-scarf': {
    id: 'red-scarf',
    name: 'Red Scarf',
    blurb: 'Gift Shop classic · warm waddle wrap',
    slot: 'extra',
    texture: 'acc-red-scarf',
    owner: 'penguin-shop',
    price: 25,
    wearable: 'penguin',
  },
  'blue-toque': {
    id: 'blue-toque',
    name: 'Blue Toque',
    blurb: 'Knit beanie with a pom · ski-hill staple',
    slot: 'headLeft',
    texture: 'acc-blue-toque',
    owner: 'penguin-shop',
    price: 20,
    wearable: 'penguin',
  },
  'miner-helmet': {
    id: 'miner-helmet',
    name: 'Miner Helmet',
    blurb: 'Mine Shack hard hat · lamp included',
    slot: 'headLeft',
    texture: 'acc-miner-helmet',
    owner: 'penguin-shop',
    price: 30,
    wearable: 'penguin',
  },
  'ninja-mask': {
    id: 'ninja-mask',
    name: 'Ninja Mask',
    blurb: 'Dojo secret · card-jitsu ready',
    slot: 'headRight',
    texture: 'acc-ninja-mask',
    owner: 'penguin-shop',
    price: 35,
    wearable: 'penguin',
  },
  'pizza-apron': {
    id: 'pizza-apron',
    name: 'Pizza Apron',
    blurb: 'Pizza Parlor shift wear · extra cheese',
    slot: 'body',
    texture: 'acc-pizza-apron',
    owner: 'penguin-shop',
    price: 28,
    wearable: 'penguin',
  },
  // Pet Boutique — Kirby-only gear.
  'chef-toque': {
    id: 'chef-toque',
    name: 'Chef Toque',
    blurb: 'Puffy cook’s hat · Kirby’s ready to serve',
    slot: 'headLeft',
    texture: 'acc-chef-toque',
    owner: 'pet-boutique',
    price: 24,
    wearable: 'kirby',
  },
  'star-band': {
    id: 'star-band',
    name: 'Star Band',
    blurb: 'Red sweatband with a gold star · warp ready',
    slot: 'headRight',
    texture: 'acc-star-band',
    owner: 'pet-boutique',
    price: 20,
    wearable: 'kirby',
  },
  'top-bow': {
    id: 'top-bow',
    name: 'Top Bow',
    blurb: 'Pink bow perched up top · very poyo',
    slot: 'extra',
    texture: 'acc-top-bow',
    owner: 'pet-boutique',
    price: 16,
    wearable: 'kirby',
  },
  'kirby-bowtie': {
    id: 'kirby-bowtie',
    name: 'Dapper Bowtie',
    blurb: 'Little red bowtie · formal puffball',
    slot: 'body',
    texture: 'acc-kirby-bowtie',
    owner: 'pet-boutique',
    price: 18,
    wearable: 'kirby',
  },
  // Pet Boutique — classic Tamagotchi gear.
  'mini-crown': {
    id: 'mini-crown',
    name: 'Mini Crown',
    blurb: 'Tiny gold crown · fits between the ears',
    slot: 'headLeft',
    texture: 'acc-mini-crown',
    owner: 'pet-boutique',
    price: 30,
    wearable: 'classic',
  },
  'ribbon-tie': {
    id: 'ribbon-tie',
    name: 'Ribbon Tie',
    blurb: 'Soft lilac bow · tied under the chin',
    slot: 'body',
    texture: 'acc-ribbon-tie',
    owner: 'pet-boutique',
    price: 18,
    wearable: 'classic',
  },
};

export const ACCESSORY_LIST = Object.values(ACCESSORIES);

export const BONGBONGEE_SHOP_ITEMS = ACCESSORY_LIST.filter((a) => a.owner === 'bongbongee');

export const CINNA_SHOP_ITEMS = ACCESSORY_LIST.filter((a) => a.owner === 'cinnamoroll');

export const PUFFLE_SHOP_ITEMS = ACCESSORY_LIST.filter((a) => a.owner === 'puffle-dig');

export const PENGUIN_SHOP_ITEMS = ACCESSORY_LIST.filter((a) => a.owner === 'penguin-shop');

export const PET_BOUTIQUE_ITEMS = ACCESSORY_LIST.filter((a) => a.owner === 'pet-boutique');

/**
 * PNG-backed accessory art loaded in Boot. Penguin clothes are absent on
 * purpose — their icons and worn looks are generated in pixelart.ts.
 */
type NonPenguinAccessoryId = Exclude<AccessoryId, PenguinAccessoryId>;

export const ACCESSORY_ASSET_PATH: Record<NonPenguinAccessoryId, string> = {
  'aqua-clip': 'assets/accessories/aqua-clip.png',
  'mint-puff': 'assets/accessories/mint-puff.png',
  'diamond-tee': 'assets/accessories/diamond-tee.png',
  'carat-sash': 'assets/accessories/carat-sash.png',
  'cloud-bow': 'assets/accessories/cloud-bow.png',
  'ear-cloud': 'assets/accessories/ear-cloud.png',
  'cafe-apron': 'assets/accessories/cafe-apron.png',
  'cinnamon-scarf': 'assets/accessories/cinnamon-scarf.png',
  'puffle-tee': 'assets/accessories/puffle-tee.png',
  'puffle-cape': 'assets/accessories/puffle-cape.png',
  'feather-boa': 'assets/accessories/feather-boa.png',
  'propeller-hat': 'assets/accessories/propeller-hat.png',
  'newspaper-hat': 'assets/accessories/newspaper-hat.png',
  snorkel: 'assets/accessories/snorkel.png',
  'glam-glasses': 'assets/accessories/glam-glasses.png',
  'brown-goggles': 'assets/accessories/brown-goggles.png',
  'big-sunglasses': 'assets/accessories/big-sunglasses.png',
  'chef-toque': 'assets/accessories/chef-toque.png',
  'star-band': 'assets/accessories/star-band.png',
  'top-bow': 'assets/accessories/top-bow.png',
  'kirby-bowtie': 'assets/accessories/kirby-bowtie.png',
  'mini-crown': 'assets/accessories/mini-crown.png',
  'ribbon-tie': 'assets/accessories/ribbon-tie.png',
};

/** PNG path for loaded accessories; penguin clothes are generated at runtime. */
export function accessoryAssetPath(id: AccessoryId): string | undefined {
  return id in ACCESSORY_ASSET_PATH
    ? ACCESSORY_ASSET_PATH[id as NonPenguinAccessoryId]
    : undefined;
}

export function isAccessoryId(value: unknown): value is AccessoryId {
  return typeof value === 'string' && value in ACCESSORIES;
}

/**
 * Phaser scale so a 32×32 accessory draws at the same on-screen height as the
 * pet. Prefer this over `pet.scaleX` so hi-res plates (Kirby) stay correct.
 */
export function accessoryWorldScale(
  petDisplayHeight: number,
  layoutScale = 1,
  canvas = ACCESSORY_CANVAS,
): number {
  if (!(petDisplayHeight > 0) || !(canvas > 0)) return layoutScale;
  return (petDisplayHeight / canvas) * layoutScale;
}

/** Per-item draw tweaks when layered on the pet sprite (32×32 canvas units). */
export type AccessoryLayout = {
  /**
   * Native accessory-canvas pixels, multiplied by accessoryWorldScale at
   * render time so the fit holds for any pet plate resolution.
   */
  offsetX?: number;
  offsetY?: number;
  /** Multiplier on the accessory world scale. */
  scale?: number;
};

export const ACCESSORY_LAYOUT: Partial<Record<AccessoryId, AccessoryLayout>> = {
  'cinnamon-scarf': { scale: 0.95, offsetY: 0.5 },
  'cafe-apron': { offsetY: 0.5 },
  'big-sunglasses': { offsetY: 1.5 },
  'diamond-tee': { offsetY: 0.5 },
  'carat-sash': { scale: 0.95 },
};

/**
 * Per-species position nudges in accessory-canvas pixels. Classic Tamagotchi
 * faces put eyes and mouths at different heights, so a single centred
 * accessory can't fit them all.
 */
export const SPECIES_ACCESSORY_NUDGE: Partial<
  Record<string, Partial<Record<AccessoryId, { x?: number; y?: number }>>>
> = {
  mametchi: { 'ribbon-tie': { y: 2 } },
  kuchipatchi: { 'ribbon-tie': { y: 1 } },
  mimitchi: { 'ribbon-tie': { y: 3 } },
  flowetchi: { 'ribbon-tie': { y: 1 } },
  gozarutchi: { 'ribbon-tie': { y: 2 } },
  memetchi: { 'ribbon-tie': { y: 3 } },
  mamekitty: { 'ribbon-tie': { y: 2 } },
  bongbongee: {
    'aqua-clip': { x: -1, y: -1 },
    'mint-puff': { x: 1, y: -1 },
    'diamond-tee': { y: 1 },
  },
  kirby: {
    'kirby-bowtie': { y: 2 },
    'chef-toque': { y: -1 },
    'top-bow': { y: -1 },
  },
};

export function accessoryTextureKey(id: AccessoryId): string {
  return ACCESSORIES[id].texture;
}
