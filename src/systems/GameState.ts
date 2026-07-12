// Central game state with localStorage + optional Convex cloud sync.
// Pet needs decay is computed from timestamps, so the pet keeps "living"
// while the game is closed — the Tamagotchi mechanic.

import {
  ACCESSORIES,
  ACCESSORY_LIST,
  isAccessoryId,
  type AccessoryId,
  type AccessorySlot,
} from './accessories';
import { isPetSpecies, type PetSpecies } from './pets';

export interface PetStats {
  hunger: number; // 0 = starving, 100 = full
  happiness: number; // 0 = miserable, 100 = delighted
  energy: number; // 0 = exhausted, 100 = rested
}

export interface PlacedItem {
  id: string; // item definition id
  gx: number; // grid x in the house
  gy: number; // grid y
}

export type EquippedAccessories = Partial<Record<AccessorySlot, AccessoryId>>;

export interface SaveData {
  version: number;
  coins: number;
  petName: string;
  petSpecies: PetSpecies;
  /** False until the player picks a pet + name on first launch. */
  adopted: boolean;
  pet: PetStats;
  lastSeen: number; // epoch ms, for offline decay
  inventory: Record<string, number>; // itemId -> count (food + unplaced furniture)
  placed: PlacedItem[];
  bestPaperToss: number;
  /** Biggest fish landed while shore-fishing, in centimetres. */
  biggestCatch: number;
  /** Accessory ids gifted by Bongbongee (or granted on adopting them). */
  ownedAccessories: AccessoryId[];
  /** One equipped accessory per slot. */
  equippedAccessories: EquippedAccessories;
  /**
   * Penguin colourway. Device-local: deliberately NOT in snapshot() — the
   * deployed Convex validator rejects unknown fields, so it can't ride
   * along until the server schema gains it.
   */
  penguinColor?: string;
  /**
   * Day stamp (Date#toDateString) of each villager's last claimed daily
   * gift. Device-local like penguinColor: NOT in snapshot().
   */
  npcGiftDays?: Record<string, string>;
}

export interface ItemDef {
  id: string;
  name: string;
  texture: string;
  kind: 'food' | 'furniture';
  price: number;
  // food effects
  hunger?: number;
  happiness?: number;
  /** Caught in the wild — never sold in Daniel's shop. */
  catchOnly?: boolean;
}

/** Coins earned each time you feed your pet. */
export const FEED_COIN_REWARD = 3;
/** Flat tip for clearing a Paper Toss stage. */
export const PAPER_TOSS_PARTICIPATION_COINS = 5;
/** Energy the pet loses per completed Paper Toss throw. */
export const PAPER_TOSS_ENERGY_PER_THROW = 3;
/** Happiness gained per throw on stage 1; multiplies by stage number. */
export const PAPER_TOSS_HAPPINESS_PER_STAGE = 2;

export const ITEMS: Record<string, ItemDef> = {
  fish: { id: 'fish', name: 'Fishy Snack', texture: 'fish', kind: 'food', price: 5, hunger: 25, happiness: 5 },
  cookie: { id: 'cookie', name: 'Choco Cookie', texture: 'cookie', kind: 'food', price: 8, hunger: 15, happiness: 15 },
  'oceanfish-common': {
    id: 'oceanfish-common',
    name: 'Silver Minnow',
    texture: 'oceanfish-common',
    kind: 'food',
    price: 0,
    hunger: 20,
    happiness: 8,
    catchOnly: true,
  },
  'oceanfish-uncommon': {
    id: 'oceanfish-uncommon',
    name: 'Mint Bass',
    texture: 'oceanfish-uncommon',
    kind: 'food',
    price: 0,
    hunger: 32,
    happiness: 14,
    catchOnly: true,
  },
  'oceanfish-rare': {
    id: 'oceanfish-rare',
    name: 'Sunset Snapper',
    texture: 'oceanfish-rare',
    kind: 'food',
    price: 0,
    hunger: 45,
    happiness: 22,
    catchOnly: true,
  },
  plant: { id: 'plant', name: 'Potted Plant', texture: 'item-plant', kind: 'furniture', price: 20 },
  flower: { id: 'flower', name: 'Flower Vase', texture: 'item-flower', kind: 'furniture', price: 15 },
  chair: { id: 'chair', name: 'Cozy Chair', texture: 'item-chair', kind: 'furniture', price: 30 },
  table: { id: 'table', name: 'Wood Table', texture: 'item-table', kind: 'furniture', price: 35 },
  rug: { id: 'rug', name: 'Pink Rug', texture: 'item-rug', kind: 'furniture', price: 25 },
  lamp: { id: 'lamp', name: 'Sun Lamp', texture: 'item-lamp', kind: 'furniture', price: 22 },
  bed: { id: 'bed', name: 'Dream Bed', texture: 'item-bed', kind: 'furniture', price: 50 },
  bookshelf: { id: 'bookshelf', name: 'Bookshelf', texture: 'item-bookshelf', kind: 'furniture', price: 45 },
  tv: { id: 'tv', name: 'Retro TV', texture: 'item-tv', kind: 'furniture', price: 60 },
  lightstick: {
    id: 'lightstick',
    name: 'SVT Lightstick VER.3 Anniversary',
    texture: 'item-lightstick',
    kind: 'furniture',
    price: 88,
  },
};

// Decay rates: points lost per hour.
const DECAY_PER_HOUR = { hunger: 6, happiness: 4, energy: 3 };
// Cap offline decay so a week away doesn't feel like a punishment.
const MAX_OFFLINE_HOURS = 12;

const KEY = 'pet-village-save-v1';
export const WELCOME_KEY = 'pet-village-welcomed';

type CloudSaver = (data: SaveData) => void;

function clamp(v: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, v));
}

export function defaultSave(): SaveData {
  return {
    version: 1,
    coins: 30,
    petName: '',
    petSpecies: 'mametchi',
    adopted: false,
    pet: { hunger: 80, happiness: 80, energy: 90 },
    lastSeen: Date.now(),
    inventory: { fish: 2 },
    placed: [
      // gy must be >= WALL_ROWS (2) or the item spawns inside the top wall
      // band — unreachable, since floor tiles are the only clickable ones.
      { id: 'bed', gx: 1, gy: 2 },
      { id: 'rug', gx: 5, gy: 4 },
    ],
    bestPaperToss: 0,
    biggestCatch: 0,
    ownedAccessories: [],
    equippedAccessories: {},
    penguinColor: 'blue',
    npcGiftDays: {},
  };
}

function normalizeOwned(raw: unknown): AccessoryId[] {
  if (!Array.isArray(raw)) return [];
  const out: AccessoryId[] = [];
  for (const id of raw) {
    if (isAccessoryId(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function normalizeEquipped(raw: unknown): EquippedAccessories {
  if (!raw || typeof raw !== 'object') return {};
  const out: EquippedAccessories = {};
  for (const [slot, id] of Object.entries(raw as Record<string, unknown>)) {
    if (
      (slot === 'headLeft' || slot === 'headRight' || slot === 'body' || slot === 'extra') &&
      isAccessoryId(id) &&
      ACCESSORIES[id].slot === slot
    ) {
      out[slot] = id;
    }
  }
  return out;
}

function mergeSave(parsed: Partial<SaveData> & { petSpecies?: unknown }): SaveData {
  const base = defaultSave();
  const hadPriorSave = parsed.version !== undefined;
  const species = isPetSpecies(parsed.petSpecies) ? parsed.petSpecies : base.petSpecies;
  return {
    ...base,
    ...parsed,
    petSpecies: species,
    // Older saves never had `adopted` — treat them as already playing.
    adopted: parsed.adopted ?? hadPriorSave,
    petName: parsed.petName ?? (hadPriorSave ? 'Mochi' : base.petName),
    pet: { ...base.pet, ...parsed.pet },
    inventory: parsed.inventory ?? base.inventory,
    placed: parsed.placed ?? base.placed,
    ownedAccessories: normalizeOwned(parsed.ownedAccessories),
    equippedAccessories: normalizeEquipped(parsed.equippedAccessories),
  };
}

class GameStateStore {
  data: SaveData;
  private cloudSaver: CloudSaver | null = null;
  private cloudTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.data = this.loadLocal();
    this.applyOfflineDecay();
  }

  private loadLocal(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (!parsed.version) return defaultSave();
      return mergeSave(parsed);
    } catch {
      return defaultSave();
    }
  }

  /** Replace in-memory state from a cloud (or other) save, then apply offline decay. */
  hydrate(raw: Partial<SaveData>) {
    // Cloud saves don't carry the device-local fields — keep them.
    const localColor = this.data.penguinColor;
    const localGiftDays = this.data.npcGiftDays;
    this.data = mergeSave(raw);
    this.data.penguinColor = raw.penguinColor ?? localColor;
    this.data.npcGiftDays = raw.npcGiftDays ?? localGiftDays;
    this.applyOfflineDecay();
    this.persistLocal();
  }

  snapshot(): SaveData {
    return {
      version: this.data.version,
      coins: this.data.coins,
      petName: this.data.petName,
      petSpecies: this.data.petSpecies,
      adopted: this.data.adopted,
      pet: { ...this.data.pet },
      lastSeen: this.data.lastSeen,
      inventory: { ...this.data.inventory },
      placed: this.data.placed.map((p) => ({ ...p })),
      bestPaperToss: this.data.bestPaperToss,
      biggestCatch: this.data.biggestCatch,
      ownedAccessories: [...this.data.ownedAccessories],
      equippedAccessories: { ...this.data.equippedAccessories },
    };
  }

  setCloudSaver(saver: CloudSaver | null) {
    if (this.cloudTimer) {
      clearTimeout(this.cloudTimer);
      this.cloudTimer = null;
    }
    this.cloudSaver = saver;
  }

  private persistLocal() {
    this.data.lastSeen = Date.now();
    localStorage.setItem(KEY, JSON.stringify(this.data));
  }

  save() {
    this.persistLocal();
    if (!this.cloudSaver) return;
    if (this.cloudTimer) clearTimeout(this.cloudTimer);
    this.cloudTimer = setTimeout(() => {
      this.cloudSaver?.(this.snapshot());
    }, 700);
  }

  /**
   * Flush a *pending* debounced cloud write immediately (e.g. beforeunload,
   * sign-out). No-op when nothing is pending — the last write already synced.
   */
  flushCloud() {
    if (!this.cloudTimer) return;
    clearTimeout(this.cloudTimer);
    this.cloudTimer = null;
    this.cloudSaver?.(this.snapshot());
  }

  private applyOfflineDecay() {
    const hours = Math.min(MAX_OFFLINE_HOURS, (Date.now() - this.data.lastSeen) / 3_600_000);
    if (hours <= 0) return;
    this.decay(hours);
    this.persistLocal();
  }

  /**
   * Reconcile decay for time spent with the tab hidden. Phaser's timers
   * pause while animation frames are suspended, and the hide-flush advances
   * lastSeen — without this, backgrounding the tab would pause the pet's
   * clock entirely. Same 12h cap as any offline period.
   */
  reconcileElapsedDecay() {
    this.applyOfflineDecay();
  }

  // Called with fractional hours; also used for live ticking while playing.
  decay(hours: number) {
    const p = this.data.pet;
    p.hunger = clamp(p.hunger - DECAY_PER_HOUR.hunger * hours);
    p.happiness = clamp(p.happiness - DECAY_PER_HOUR.happiness * hours);
    p.energy = clamp(p.energy - DECAY_PER_HOUR.energy * hours);
    // A hungry pet gets sad faster.
    if (p.hunger < 20) p.happiness = clamp(p.happiness - 2 * hours);
  }

  get coins() {
    return this.data.coins;
  }

  addCoins(n: number) {
    this.data.coins += n;
    this.save();
  }

  /** Whether a villager's once-per-day gift is still available today. */
  canClaimNpcGift(npcId: string): boolean {
    return this.data.npcGiftDays?.[npcId] !== new Date().toDateString();
  }

  /** Claim a villager's daily coin gift; false if already claimed today. */
  claimNpcGift(npcId: string, coins: number): boolean {
    if (!this.canClaimNpcGift(npcId)) return false;
    const days = this.data.npcGiftDays ?? (this.data.npcGiftDays = {});
    days[npcId] = new Date().toDateString();
    this.data.coins += coins;
    // Making a friend cheers the pet up a little, too.
    this.data.pet.happiness = clamp(this.data.pet.happiness + 3);
    this.save();
    return true;
  }

  spendCoins(n: number): boolean {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.save();
    return true;
  }

  addItem(id: string, count = 1) {
    this.data.inventory[id] = (this.data.inventory[id] ?? 0) + count;
    this.save();
  }

  /** Record a shore catch size (cm). Returns true if it set a new personal best. */
  recordCatch(sizeCm: number): boolean {
    const size = Math.max(0, Math.round(sizeCm));
    if (size <= this.data.biggestCatch) return false;
    this.data.biggestCatch = size;
    this.save();
    return true;
  }

  removeItem(id: string): boolean {
    const have = this.data.inventory[id] ?? 0;
    if (have <= 0) return false;
    if (have === 1) delete this.data.inventory[id];
    else this.data.inventory[id] = have - 1;
    this.save();
    return true;
  }

  feedPet(foodId: string): boolean {
    const def = ITEMS[foodId];
    if (!def || def.kind !== 'food') return false;
    if (!this.removeItem(foodId)) return false;
    const p = this.data.pet;
    p.hunger = clamp(p.hunger + (def.hunger ?? 0));
    p.happiness = clamp(p.happiness + (def.happiness ?? 0));
    // Shop food softens the buy cost with a tip; catch-only fish must not
    // mint coins (free catch → feed → +3c would be an unbounded faucet).
    if (!def.catchOnly) {
      this.data.coins += FEED_COIN_REWARD;
    }
    this.save();
    return true;
  }

  /**
   * Apply mini-game throw costs. Pass `{ persist: false }` to batch many throws
   * and call `save()` once at stage end.
   */
  drainEnergyFromPlay(energy = 3, happiness = 2, opts?: { persist?: boolean }) {
    this.data.pet.energy = clamp(this.data.pet.energy - energy);
    this.data.pet.happiness = clamp(this.data.pet.happiness + happiness);
    if (opts?.persist !== false) this.save();
  }

  petSleep() {
    this.data.pet.energy = 100;
    this.save();
  }

  setPenguinColor(color: string) {
    this.data.penguinColor = color;
    this.save();
  }

  placeItem(id: string, gx: number, gy: number): boolean {
    if (!this.removeItem(id)) return false;
    this.data.placed.push({ id, gx, gy });
    this.save();
    return true;
  }

  pickUpItem(gx: number, gy: number): string | null {
    const idx = this.data.placed.findIndex((p) => p.gx === gx && p.gy === gy);
    if (idx === -1) return null;
    const [removed] = this.data.placed.splice(idx, 1);
    this.addItem(removed.id);
    return removed.id;
  }

  petMood(): 'happy' | 'ok' | 'sad' {
    const p = this.data.pet;
    const avg = (p.hunger + p.happiness + p.energy) / 3;
    if (avg >= 60) return 'happy';
    if (avg >= 30) return 'ok';
    return 'sad';
  }

  /**
   * The face the pet should wear: the most pressing need wins, so hunger
   * and exhaustion show even when the overall average is still okay.
   */
  petExpression(): 'hungry' | 'tired' | 'sad' | 'happy' | 'ok' {
    const p = this.data.pet;
    if (p.hunger < 30) return 'hungry';
    if (p.energy < 25) return 'tired';
    if (p.happiness < 35) return 'sad';
    return this.petMood() === 'happy' ? 'happy' : 'ok';
  }

  adopt(species: PetSpecies, name: string) {
    const trimmed = name.trim().slice(0, 12);
    if (!trimmed) throw new Error('Name your pet');
    this.data.petSpecies = species;
    this.data.petName = trimmed;
    this.data.adopted = true;
    // Fresh needs for the new companion — village progress is untouched.
    this.data.pet = { hunger: 80, happiness: 80, energy: 90 };
    if (species === 'bongbongee') {
      this.grantAllBongbongeeAccessories();
      // Signature plush look from the official CARAT merch.
      this.data.equippedAccessories = {
        headLeft: 'mint-pom',
        headRight: 'carat-diamond',
        body: 'blue-tee',
      };
    }
    this.save();
    // Adoption is a milestone — push it to the cloud immediately instead of
    // trusting the debounce to survive a quick tab close.
    this.flushCloud();
  }

  ownsAccessory(id: AccessoryId): boolean {
    return this.data.ownedAccessories.includes(id);
  }

  ownedAccessoryIds(): AccessoryId[] {
    return [...this.data.ownedAccessories];
  }

  isAccessoryEquipped(id: AccessoryId): boolean {
    const slot = ACCESSORIES[id].slot;
    return this.data.equippedAccessories[slot] === id;
  }

  grantAccessory(id: AccessoryId) {
    if (!this.data.ownedAccessories.includes(id)) {
      this.data.ownedAccessories.push(id);
      this.save();
    }
  }

  /** Buy a priced accessory (Cinnamoroll shop). Returns false if can't afford / already owned. */
  buyAccessory(id: AccessoryId): boolean {
    const def = ACCESSORIES[id];
    if (!def?.price) return false;
    if (this.ownsAccessory(id)) return false;
    if (!this.spendCoins(def.price)) return false;
    this.data.ownedAccessories.push(id);
    this.save();
    return true;
  }

  grantAllBongbongeeAccessories() {
    let changed = false;
    for (const a of ACCESSORY_LIST) {
      if (a.owner !== 'bongbongee') continue;
      if (!this.data.ownedAccessories.includes(a.id)) {
        this.data.ownedAccessories.push(a.id);
        changed = true;
      }
    }
    if (changed) this.save();
  }

  toggleAccessory(id: AccessoryId) {
    if (!this.ownsAccessory(id)) return;
    const slot = ACCESSORIES[id].slot;
    if (this.data.equippedAccessories[slot] === id) {
      delete this.data.equippedAccessories[slot];
    } else {
      this.data.equippedAccessories[slot] = id;
    }
    this.save();
  }

  unequipAllAccessories() {
    this.data.equippedAccessories = {};
    this.save();
  }

  equippedAccessoryIds(): AccessoryId[] {
    const ids: AccessoryId[] = [];
    for (const id of Object.values(this.data.equippedAccessories)) {
      if (id) ids.push(id);
    }
    return ids;
  }

  /**
   * Return to the adopt screen without wiping the village.
   * Keeps coins, furniture, inventory, scores, and clothes.
   */
  resetToPetSelect() {
    if (this.cloudTimer) {
      clearTimeout(this.cloudTimer);
      this.cloudTimer = null;
    }
    this.data.adopted = false;
    this.data.petName = '';
    this.data.petSpecies = 'mametchi';
    this.data.pet = { hunger: 80, happiness: 80, energy: 90 };
    this.persistLocal();
  }
}

export const State = new GameStateStore();
