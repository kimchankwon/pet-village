/** Equippable pet clothes — Bongbongee gifts, Cinnamoroll cafe + puffle dig finds. */

export type AccessorySlot = 'headLeft' | 'headRight' | 'body' | 'extra';

export type AccessoryId =
  | 'mint-pom'
  | 'carat-diamond'
  | 'blue-tee'
  | 'deco-band'
  | 'cloud-bow'
  | 'ear-cloud'
  | 'cafe-apron'
  | 'cinnamon-scarf'
  | 'puffle-tee'
  | 'puffle-cape'
  | 'feather-boa'
  | 'propeller-hat'
  | 'newspaper-hat'
  | 'snorkel'
  | 'glam-glasses'
  | 'brown-goggles'
  | 'big-sunglasses';

export type AccessorySource = 'bongbongee' | 'cinnamoroll' | 'puffle-dig';

/**
 * Who may wear this item. Defaults from `owner` when omitted
 * (`puffle-dig` → puffles; otherwise the owner mascot).
 */
export type AccessoryWearable = 'bongbongee' | 'cinnamoroll' | 'puffle';

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
  return def.owner;
}

export const ACCESSORIES: Record<AccessoryId, AccessoryDef> = {
  'mint-pom': {
    id: 'mint-pom',
    name: 'Mint Pom',
    blurb: 'Fluffy mint ball · left of the pink cap',
    slot: 'headLeft',
    texture: 'acc-mint-pom',
    owner: 'bongbongee',
    wearable: 'bongbongee',
  },
  'carat-diamond': {
    id: 'carat-diamond',
    name: 'Carat Diamond',
    blurb: 'Aqua gem · CARAT lightstick sparkle',
    slot: 'headRight',
    texture: 'acc-carat-diamond',
    owner: 'bongbongee',
    wearable: 'bongbongee',
  },
  'blue-tee': {
    id: 'blue-tee',
    name: 'NEW Tee',
    blurb: 'Baby-blue shirt with cursive NEW',
    slot: 'body',
    texture: 'acc-blue-tee',
    owner: 'bongbongee',
    wearable: 'bongbongee',
  },
  'deco-band': {
    id: 'deco-band',
    name: 'CARAT Deco Band',
    blurb: 'Sky-blue band from CARAT LAND',
    slot: 'extra',
    texture: 'acc-deco-band',
    owner: 'bongbongee',
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
};

export const ACCESSORY_LIST = Object.values(ACCESSORIES);

export const CINNA_SHOP_ITEMS = ACCESSORY_LIST.filter((a) => a.owner === 'cinnamoroll');

export const PUFFLE_SHOP_ITEMS = ACCESSORY_LIST.filter((a) => a.owner === 'puffle-dig');

export const ACCESSORY_ASSET_PATH: Record<AccessoryId, string> = {
  'mint-pom': 'assets/accessories/mint-pom.png',
  'carat-diamond': 'assets/accessories/carat-diamond.png',
  'blue-tee': 'assets/accessories/blue-tee.png',
  'deco-band': 'assets/accessories/deco-band.png',
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
};

export function isAccessoryId(value: unknown): value is AccessoryId {
  return typeof value === 'string' && value in ACCESSORIES;
}

export function accessoryTextureKey(id: AccessoryId): string {
  return ACCESSORIES[id].texture;
}
