/** Equippable pet clothes/accessories from Bongbongee gifts + Cinnamoroll's shop. */

export type AccessorySlot = 'headLeft' | 'headRight' | 'body' | 'extra';

export type AccessoryId =
  | 'mint-pom'
  | 'carat-diamond'
  | 'blue-tee'
  | 'deco-band'
  | 'cloud-bow'
  | 'ear-cloud'
  | 'cafe-apron'
  | 'cinnamon-scarf';

export type AccessorySource = 'bongbongee' | 'cinnamoroll';

export interface AccessoryDef {
  id: AccessoryId;
  name: string;
  blurb: string;
  slot: AccessorySlot;
  /** Phaser texture key (loaded in Boot). */
  texture: string;
  /** Who provides this item. */
  owner: AccessorySource;
  /** Coin price when sold by Cinnamoroll. Gifts omit this. */
  price?: number;
}

export const ACCESSORIES: Record<AccessoryId, AccessoryDef> = {
  'mint-pom': {
    id: 'mint-pom',
    name: 'Mint Pom',
    blurb: 'Fluffy mint ball · left of the pink cap',
    slot: 'headLeft',
    texture: 'acc-mint-pom',
    owner: 'bongbongee',
  },
  'carat-diamond': {
    id: 'carat-diamond',
    name: 'Carat Diamond',
    blurb: 'Aqua gem · CARAT lightstick sparkle',
    slot: 'headRight',
    texture: 'acc-carat-diamond',
    owner: 'bongbongee',
  },
  'blue-tee': {
    id: 'blue-tee',
    name: 'NEW Tee',
    blurb: 'Baby-blue shirt with cursive NEW',
    slot: 'body',
    texture: 'acc-blue-tee',
    owner: 'bongbongee',
  },
  'deco-band': {
    id: 'deco-band',
    name: 'CARAT Deco Band',
    blurb: 'Sky-blue band from CARAT LAND',
    slot: 'extra',
    texture: 'acc-deco-band',
    owner: 'bongbongee',
  },
  'cloud-bow': {
    id: 'cloud-bow',
    name: 'Cloud Bow',
    blurb: 'Soft pink bow · smells like pastry steam',
    slot: 'headLeft',
    texture: 'acc-cloud-bow',
    owner: 'cinnamoroll',
    price: 18,
  },
  'ear-cloud': {
    id: 'ear-cloud',
    name: 'Ear Cloud',
    blurb: 'Tiny sky puff · floats like Cinna’s ears',
    slot: 'headRight',
    texture: 'acc-ear-cloud',
    owner: 'cinnamoroll',
    price: 16,
  },
  'cafe-apron': {
    id: 'cafe-apron',
    name: 'Cafe Apron',
    blurb: 'Cafe Cinnamon apron · ready to help',
    slot: 'body',
    texture: 'acc-cafe-apron',
    owner: 'cinnamoroll',
    price: 28,
  },
  'cinnamon-scarf': {
    id: 'cinnamon-scarf',
    name: 'Cinnamon Scarf',
    blurb: 'Warm swirl scarf · like a cinnamon roll',
    slot: 'extra',
    texture: 'acc-cinnamon-scarf',
    owner: 'cinnamoroll',
    price: 22,
  },
};

export const ACCESSORY_LIST = Object.values(ACCESSORIES);

export const CINNA_SHOP_ITEMS = ACCESSORY_LIST.filter((a) => a.owner === 'cinnamoroll');

export const ACCESSORY_ASSET_PATH: Record<AccessoryId, string> = {
  'mint-pom': 'assets/accessories/mint-pom.png',
  'carat-diamond': 'assets/accessories/carat-diamond.png',
  'blue-tee': 'assets/accessories/blue-tee.png',
  'deco-band': 'assets/accessories/deco-band.png',
  'cloud-bow': 'assets/accessories/cloud-bow.png',
  'ear-cloud': 'assets/accessories/ear-cloud.png',
  'cafe-apron': 'assets/accessories/cafe-apron.png',
  'cinnamon-scarf': 'assets/accessories/cinnamon-scarf.png',
};

export function isAccessoryId(value: unknown): value is AccessoryId {
  return typeof value === 'string' && value in ACCESSORIES;
}

export function accessoryTextureKey(id: AccessoryId): string {
  return ACCESSORIES[id].texture;
}
