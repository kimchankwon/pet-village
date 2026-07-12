/** Equippable pet clothes/accessories — Bongbongee's CARAT merch set. */

export type AccessorySlot = 'headLeft' | 'headRight' | 'body' | 'extra';

export type AccessoryId = 'mint-pom' | 'carat-diamond' | 'blue-tee' | 'deco-band';

export interface AccessoryDef {
  id: AccessoryId;
  name: string;
  blurb: string;
  slot: AccessorySlot;
  /** Phaser texture key (loaded in Boot). */
  texture: string;
  /** Owner NPC who gifts these. */
  owner: 'bongbongee';
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
};

export const ACCESSORY_LIST = Object.values(ACCESSORIES);

export const ACCESSORY_ASSET_PATH: Record<AccessoryId, string> = {
  'mint-pom': 'assets/accessories/mint-pom.png',
  'carat-diamond': 'assets/accessories/carat-diamond.png',
  'blue-tee': 'assets/accessories/blue-tee.png',
  'deco-band': 'assets/accessories/deco-band.png',
};

export function isAccessoryId(value: unknown): value is AccessoryId {
  return typeof value === 'string' && value in ACCESSORIES;
}

export function accessoryTextureKey(id: AccessoryId): string {
  return ACCESSORIES[id].texture;
}
