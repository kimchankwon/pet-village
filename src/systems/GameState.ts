// Central game state with localStorage + optional Convex cloud sync.
// Pet needs decay is computed from timestamps, so the pet keeps "living"
// while the game is closed — the Tamagotchi mechanic.

import {
  ACCESSORIES,
  ACCESSORY_LIST,
  accessoryWearable,
  isAccessoryId,
  type AccessoryId,
  type AccessorySlot,
} from './accessories';
import {
  isClassicSpecies,
  isPetSpecies,
  isPuffleSpecies,
  migratePetSpecies,
  type PetSpecies,
} from './pets';
import {
  FISHING_BAIT_PRICE,
  FISHY_SNACK_HUNGER,
  applyPetFoodStats,
  petCanEat,
} from './petFoodRules';
import { FISHING_CATCH_HAPPINESS, type FishTierId } from './fishingRules';
import { GET_WIN_REWARDS, type GetDifficulty } from './getGameRules';
import {
  EXPEDITION_LOSS_HAPPINESS,
  winCoins,
  winHappiness,
  winKey,
  type ExpeditionBossId,
  type ExpeditionDifficulty,
} from './expeditionRules';
import { normalizeTownPosition, type TownPosition } from './townPosition';
import { validatePetName } from './profileNameRules';
import {
  canTurnInQuest,
  isQuestId,
  normalizeQuestCounters,
  normalizeQuestProgress,
  progressKindOf,
  questDef,
  questStatus,
  type QuestProgress,
  type QuestProgressState,
} from './quests';

export const MULTIPLAYER_PROFILE_CHANGED_EVENT = 'pet-village:multiplayer-profile-changed';

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
  inventory: Record<string, number>; // itemId -> count (food + bait + unplaced furniture)
  placed: PlacedItem[];
  bestPaperToss: number;
  /** Biggest fish landed while shore-fishing, in centimetres. */
  biggestCatch: number;
  /** Best consecutive jumps in Skip Rope. */
  bestSkipRope: number;
  /**
   * Expedition clears keyed "renoir-hard" etc. Optional on old saves.
   * Counts only — mana/HP/abilities never persist between bouts.
   */
  expeditionWins?: Record<string, number>;
  /** Accessory ids bought at Cafe Cinnamon (or granted on adopting Bongbongee). */
  ownedAccessories: AccessoryId[];
  /** One equipped accessory per slot. */
  equippedAccessories: EquippedAccessories;
  /** Penguin colourway, synced so multiplayer can render the public profile accurately. */
  penguinColor?: string;
  /**
   * Clothes worn by the player's penguin (wearable: 'penguin' items only).
   * Device-local like penguinColor: NOT in snapshot().
   */
  equippedPenguinAccessories?: EquippedAccessories;
  /** Last safe Town pose, restored on the next full game launch. */
  townPosition?: TownPosition;
  /**
   * Day stamp (Date#toDateString) of each villager's last claimed daily
   * gift. Device-local like penguinColor: NOT in snapshot().
   */
  npcGiftDays?: Record<string, string>;
  /**
   * Quest progress keyed by quest id. Missing key = available (not accepted).
   * Synced via cloud saves like inventory.
   */
  quests?: QuestProgress;
  /**
   * Activity-quest counters (e.g. Skip Rope clears while a quest is active).
   * Keyed by quest id. Synced via cloud saves like quests.
   */
  questCounters?: Record<string, number>;
}

export interface ItemDef {
  id: string;
  name: string;
  texture: string;
  kind: 'food' | 'furniture' | 'bait';
  price: number;
  // food effects
  hunger?: number;
  happiness?: number;
  /** Caught in the wild — never sold in Daniel's shop. */
  catchOnly?: boolean;
}

/** Happiness gained per throw on absolute stage 1; multiplies by stage number. */
export const PAPER_TOSS_HAPPINESS_PER_STAGE = 2;
/** Coins for clearing Skip Rope (25 consecutive jumps). */
export const SKIP_ROPE_WIN_COINS = 20;
/** Happiness bump on a Skip Rope clear. */
export const SKIP_ROPE_WIN_HAPPINESS = 16;
/** Consecutive jumps needed to clear Skip Rope. */
export const SKIP_ROPE_TARGET = 25;
/** A failed Skip Rope run still banks a reward per this many cleared jumps. */
export const SKIP_ROPE_MILESTONE_JUMPS = 5;
export const SKIP_ROPE_MILESTONE_COINS = 2;
export const SKIP_ROPE_MILESTONE_HAPPINESS = 2;

/** Bump difficulty tiers — tougher opponents pay out more. */
export type BumpDifficulty = 'easy' | 'medium' | 'hard';
export const BUMP_REWARDS: Record<BumpDifficulty, { coins: number; happiness: number }> = {
  easy: { coins: 6, happiness: 5 },
  medium: { coins: 14, happiness: 9 },
  hard: { coins: 26, happiness: 14 },
};
/** Small cheer-up for a lost bout (it was still playtime). */
export const BUMP_LOSS_HAPPINESS = 2;

/** Paper Toss difficulty — each run is two absolute stages from the table below. */
export type PaperTossDifficulty = 'easy' | 'medium' | 'hard';
/** Absolute 1-based stages played for each Paper Toss difficulty (two levels each). */
export const PAPER_TOSS_DIFFICULTY_STAGES: Record<PaperTossDifficulty, readonly [number, number]> = {
  easy: [1, 2],
  medium: [2, 3],
  hard: [3, 4],
};
/**
 * Paper Toss pays per basket rather than per clear, so the rate has to rise with
 * the difficulty or an easy run would out-earn a hard one for less energy.
 */
export const PAPER_TOSS_COINS_PER_BASKET: Record<PaperTossDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};
/** Tip for clearing one of a run's two levels. */
export const PAPER_TOSS_LEVEL_CLEAR_COINS: Record<PaperTossDifficulty, number> = {
  easy: 2,
  medium: 3,
  hard: 5,
};

export const ITEMS: Record<string, ItemDef> = {
  bait: {
    id: 'bait',
    name: 'Fishing Bait',
    texture: 'bait',
    kind: 'bait',
    price: FISHING_BAIT_PRICE,
  },
  fish: {
    id: 'fish',
    name: 'Fishy Snack',
    texture: 'fish',
    kind: 'food',
    price: 5,
    hunger: FISHY_SNACK_HUNGER,
    happiness: 5,
  },
  cookie: { id: 'cookie', name: 'Choco Cookie', texture: 'cookie', kind: 'food', price: 8, hunger: 15, happiness: 15 },
  // Premium snacks target ~3.75 total-stat/coin (same band as Choco Cookie)
  // so a higher price is a gate, not a worse deal. Muffin/toast lean hunger;
  // popsicle/candy lean happy; macaron is the balanced top shelf.
  muffin: {
    id: 'muffin',
    name: 'Berry Muffin',
    texture: 'muffin',
    kind: 'food',
    price: 10,
    hunger: 22,
    happiness: 16,
  },
  popsicle: {
    id: 'popsicle',
    name: 'Rainbow Popsicle',
    texture: 'popsicle',
    kind: 'food',
    price: 12,
    hunger: 12,
    happiness: 33,
  },
  candy: {
    id: 'candy',
    name: 'Star Candy',
    texture: 'candy',
    kind: 'food',
    price: 14,
    hunger: 10,
    happiness: 43,
  },
  toast: {
    id: 'toast',
    name: 'Honey Toast',
    texture: 'toast',
    kind: 'food',
    price: 11,
    hunger: 28,
    happiness: 14,
  },
  macaron: {
    id: 'macaron',
    name: 'Mint Macaron',
    texture: 'macaron',
    kind: 'food',
    price: 16,
    hunger: 25,
    happiness: 35,
  },
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
    name: 'Carat Lightstick',
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
type AdoptionSaver = (data: SaveData) => Promise<void>;

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
      // Bed sits clearly on the floor (not against the wall); pick up to re-place.
      { id: 'bed', gx: 2, gy: 5 },
      { id: 'rug', gx: 5, gy: 4 },
    ],
    bestPaperToss: 0,
    biggestCatch: 0,
    bestSkipRope: 0,
    expeditionWins: {},
    ownedAccessories: [],
    equippedAccessories: {},
    penguinColor: 'blue',
    equippedPenguinAccessories: {},
    npcGiftDays: {},
    quests: {},
    questCounters: {},
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

function normalizeEquipped(raw: unknown, forPenguin = false): EquippedAccessories {
  if (!raw || typeof raw !== 'object') return {};
  const out: EquippedAccessories = {};
  for (const [slot, id] of Object.entries(raw as Record<string, unknown>)) {
    if (
      (slot === 'headLeft' || slot === 'headRight' || slot === 'body' || slot === 'extra') &&
      isAccessoryId(id) &&
      ACCESSORIES[id].slot === slot &&
      (accessoryWearable(ACCESSORIES[id]) === 'penguin') === forPenguin
    ) {
      out[slot] = id;
    }
  }
  return out;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeInventory(raw: unknown, fallback: Record<string, number>): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const inventory: Record<string, number> = {};
  for (const [id, count] of Object.entries(raw)) {
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) inventory[id] = count;
  }
  return inventory;
}

function normalizePlaced(raw: unknown, fallback: PlacedItem[]): PlacedItem[] {
  if (!Array.isArray(raw)) return fallback;
  return raw
    .filter((item): item is PlacedItem => {
      if (!item || typeof item !== 'object') return false;
      const value = item as Record<string, unknown>;
      return typeof value.id === 'string' && Number.isFinite(value.gx) && Number.isFinite(value.gy);
    })
    .map((item) => ({ ...item }));
}

function normalizeStringRecord(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

function normalizeNumberRecord(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      out[key] = Math.floor(value);
    }
  }
  return out;
}

export function normalizeSave(raw: unknown): SaveData {
  const base = defaultSave();
  const parsed = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Partial<SaveData> & { petSpecies?: unknown }
    : {};
  const hadPriorSave = parsed.version !== undefined;
  // Violetchi was replaced by Flowetchi (Flowertchi iD sprites).
  const species = isPetSpecies(parsed.petSpecies)
    ? migratePetSpecies(parsed.petSpecies)
    : base.petSpecies;
  return {
    ...base,
    version: finiteNumber(parsed.version, base.version),
    coins: finiteNumber(parsed.coins, base.coins),
    lastSeen: finiteNumber(parsed.lastSeen, base.lastSeen),
    bestPaperToss: finiteNumber(parsed.bestPaperToss, base.bestPaperToss),
    biggestCatch: finiteNumber(parsed.biggestCatch, base.biggestCatch),
    bestSkipRope: finiteNumber(parsed.bestSkipRope, base.bestSkipRope),
    expeditionWins: normalizeNumberRecord(parsed.expeditionWins),
    petSpecies: species,
    // Older saves never had `adopted` — treat them as already playing.
    adopted: typeof parsed.adopted === 'boolean' ? parsed.adopted : hadPriorSave,
    petName: typeof parsed.petName === 'string' ? parsed.petName : (hadPriorSave ? 'Mochi' : base.petName),
    pet: {
      hunger: finiteNumber(parsed.pet?.hunger, base.pet.hunger),
      happiness: finiteNumber(parsed.pet?.happiness, base.pet.happiness),
      energy: finiteNumber(parsed.pet?.energy, base.pet.energy),
    },
    inventory: normalizeInventory(parsed.inventory, base.inventory),
    placed: normalizePlaced(parsed.placed, base.placed),
    ownedAccessories: normalizeOwned(parsed.ownedAccessories),
    equippedAccessories: normalizeEquipped(parsed.equippedAccessories),
    penguinColor: typeof parsed.penguinColor === 'string' ? parsed.penguinColor : base.penguinColor,
    equippedPenguinAccessories: normalizeEquipped(parsed.equippedPenguinAccessories, true),
    townPosition: normalizeTownPosition(parsed.townPosition),
    npcGiftDays: normalizeStringRecord(parsed.npcGiftDays),
    quests: normalizeQuestProgress(parsed.quests),
    questCounters: normalizeQuestCounters(parsed.questCounters),
  };
}

const mergeSave = normalizeSave;

export class GameStateStore {
  data: SaveData;
  private cloudSaver: CloudSaver | null = null;
  private adoptionSaver: AdoptionSaver | null = null;
  private cloudTimer: ReturnType<typeof setTimeout> | null = null;
  private townPositionDirty = false;

  constructor() {
    this.data = this.loadLocal();
    // Decay before strip — strip may persist and would clobber lastSeen.
    this.applyOfflineDecay();
    this.stripUnwearableAccessories();
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
    const localPenguinFit = this.data.equippedPenguinAccessories;
    const localTownPosition = this.data.townPosition;
    this.data = mergeSave(raw);
    this.data.penguinColor = raw.penguinColor ?? localColor;
    this.data.npcGiftDays = raw.npcGiftDays ?? localGiftDays;
    if (!raw.equippedPenguinAccessories) this.data.equippedPenguinAccessories = localPenguinFit;
    if (!this.data.townPosition) this.data.townPosition = localTownPosition;
    // Decay before strip — strip may persist and would clobber lastSeen.
    this.applyOfflineDecay();
    this.stripUnwearableAccessories();
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
      bestSkipRope: this.data.bestSkipRope,
      expeditionWins: { ...(this.data.expeditionWins ?? {}) },
      ownedAccessories: [...this.data.ownedAccessories],
      equippedAccessories: { ...this.data.equippedAccessories },
      penguinColor: this.data.penguinColor ?? 'blue',
      ...(this.data.townPosition ? { townPosition: { ...this.data.townPosition } } : {}),
      quests: { ...(this.data.quests ?? {}) },
      questCounters: { ...(this.data.questCounters ?? {}) },
    };
  }

  setCloudSaver(saver: CloudSaver | null) {
    if (this.cloudTimer) {
      clearTimeout(this.cloudTimer);
      this.cloudTimer = null;
    }
    this.cloudSaver = saver;
  }

  setAdoptionSaver(saver: AdoptionSaver | null) {
    this.adoptionSaver = saver;
  }

  private persistLocal() {
    this.data.lastSeen = Date.now();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    }
  }

  save() {
    this.persistLocal();
    this.townPositionDirty = false;
    if (!this.cloudSaver) return;
    if (this.cloudTimer) clearTimeout(this.cloudTimer);
    this.cloudTimer = setTimeout(() => {
      this.cloudTimer = null;
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

  /** Record a Skip Rope streak. Returns true if it set a new personal best. */
  recordSkipRope(jumps: number): boolean {
    if (!Number.isFinite(jumps)) return false;
    const n = Math.max(0, Math.floor(jumps));
    if (n <= this.data.bestSkipRope) return false;
    this.data.bestSkipRope = n;
    this.save();
    return true;
  }

  /** Cheer for a landed fish — the fish itself was already added to the bag. */
  rewardFishingCatch(tier: FishTierId): number {
    const happiness = FISHING_CATCH_HAPPINESS[tier] ?? 0;
    this.data.pet.happiness = clamp(this.data.pet.happiness + happiness);
    this.save();
    return happiness;
  }

  /** Win rewards for clearing Skip Rope (energy was paid at the start of the run). */
  rewardSkipRopeWin() {
    this.data.coins += SKIP_ROPE_WIN_COINS;
    this.data.pet.happiness = clamp(this.data.pet.happiness + SKIP_ROPE_WIN_HAPPINESS);
    this.noteSkipRopeClear();
    this.save();
  }

  /**
   * Count a full Skip Rope clear toward any active skip-rope quest.
   * Caps at the quest target so turn-in stays at e.g. 3/3.
   * Private: only {@link rewardSkipRopeWin} calls this, then saves once.
   */
  private noteSkipRopeClear() {
    const progress = this.data.quests ?? {};
    for (const questId of Object.keys(progress)) {
      if (progress[questId] !== 'active') continue;
      const def = questDef(questId);
      if (!def || progressKindOf(def) !== 'skipRopeClear') continue;
      const counters = this.data.questCounters ?? (this.data.questCounters = {});
      const have = counters[questId] ?? 0;
      if (have < def.itemCount) counters[questId] = have + 1;
    }
  }

  rewardSledRun(coins: number, happiness: number) {
    this.data.coins += Math.max(0, coins);
    this.data.pet.happiness = clamp(this.data.pet.happiness + Math.max(0, happiness));
    this.save();
  }

  /** Consolation for a failed Skip Rope run: banked per full 5-jump milestone. */
  rewardSkipRopeRun(jumps: number): { coins: number; happiness: number } {
    const n = Number.isFinite(jumps) ? Math.max(0, Math.floor(jumps)) : 0;
    const milestones = Math.floor(n / SKIP_ROPE_MILESTONE_JUMPS);
    const coins = milestones * SKIP_ROPE_MILESTONE_COINS;
    const happiness = milestones * SKIP_ROPE_MILESTONE_HAPPINESS;
    if (coins > 0 || happiness > 0) {
      this.data.coins += coins;
      this.data.pet.happiness = clamp(this.data.pet.happiness + happiness);
      this.save();
    }
    return { coins, happiness };
  }

  /** Whether the pet has at least this much energy left. */
  hasEnergy(cost: number): boolean {
    return this.data.pet.energy >= cost;
  }

  /** Pay a mini-game's energy cost up front (e.g. starting a Bump bout). */
  spendEnergy(cost: number) {
    this.data.pet.energy = clamp(this.data.pet.energy - cost);
    this.save();
  }

  /** Win rewards for toppling a Bump opponent (energy was paid at bout start). */
  rewardBumpWin(difficulty: BumpDifficulty): { coins: number; happiness: number } {
    const reward = BUMP_REWARDS[difficulty];
    this.data.coins += reward.coins;
    this.data.pet.happiness = clamp(this.data.pet.happiness + reward.happiness);
    this.save();
    return reward;
  }

  /** Win rewards for clearing every note in a Get track. */
  rewardGetWin(difficulty: GetDifficulty): { coins: number; happiness: number } {
    const reward = GET_WIN_REWARDS[difficulty];
    this.data.coins += reward.coins;
    this.data.pet.happiness = clamp(this.data.pet.happiness + reward.happiness);
    this.save();
    return reward;
  }

  /**
   * Expedition clear — coins (Flawless +50% floored), happiness, and a win
   * counter keyed "renoir-hard" etc. Energy was paid at bout start.
   */
  rewardExpeditionWin(
    boss: ExpeditionBossId,
    difficulty: ExpeditionDifficulty,
    flawless: boolean,
  ): { coins: number; happiness: number; key: string } {
    const coins = winCoins(boss, difficulty, flawless);
    const happiness = winHappiness(boss, difficulty);
    const key = winKey(boss, difficulty);
    this.data.coins += coins;
    this.data.pet.happiness = clamp(this.data.pet.happiness + happiness);
    const wins = this.data.expeditionWins ?? (this.data.expeditionWins = {});
    wins[key] = (wins[key] ?? 0) + 1;
    this.save();
    return { coins, happiness, key };
  }

  /** A lost Expedition still spends energy; small happiness ding only. */
  settleExpeditionLoss() {
    this.data.pet.happiness = clamp(this.data.pet.happiness + EXPEDITION_LOSS_HAPPINESS);
    this.save();
  }

  expeditionWinCount(boss: ExpeditionBossId, difficulty: ExpeditionDifficulty): number {
    return this.data.expeditionWins?.[winKey(boss, difficulty)] ?? 0;
  }

  /** A lost Bump bout still cheers the pet a little — it was playtime. */
  settleBumpLoss() {
    this.data.pet.happiness = clamp(this.data.pet.happiness + BUMP_LOSS_HAPPINESS);
    this.save();
  }

  removeItem(id: string): boolean {
    return this.removeItems(id, 1);
  }

  /** Remove several of one item at once. No-op (returns false) if the bag is short. */
  removeItems(id: string, count: number): boolean {
    const n = Math.max(0, Math.floor(count));
    if (n <= 0) return true;
    const have = this.data.inventory[id] ?? 0;
    if (have < n) return false;
    if (have === n) delete this.data.inventory[id];
    else this.data.inventory[id] = have - n;
    this.save();
    return true;
  }

  /** Locked / available / active / completed for a known quest id. */
  getQuestStatus(questId: string): 'locked' | 'available' | 'active' | 'completed' {
    if (!isQuestId(questId)) return 'available';
    return questStatus(this.data.quests, questId);
  }

  /** Accept a quest that is still available (prerequisites already done). */
  acceptQuest(questId: string): boolean {
    if (!isQuestId(questId)) return false;
    if (this.getQuestStatus(questId) !== 'available') return false;
    const quests = this.data.quests ?? (this.data.quests = {});
    quests[questId] = 'active' satisfies QuestProgressState;
    // Activity quests start their counter at zero when accepted.
    if (progressKindOf(questDef(questId)!) === 'skipRopeClear') {
      const counters = this.data.questCounters ?? (this.data.questCounters = {});
      counters[questId] = 0;
    }
    this.save();
    return true;
  }

  /**
   * Turn in an active quest: remove required items (item quests only), grant
   * rewards, mark completed. Returns false if not active or progress is short.
   * All mutations land in one save so a mid-step crash cannot strand the bag.
   */
  completeQuest(questId: string): boolean {
    const def = questDef(questId);
    if (!def) return false;
    if (this.getQuestStatus(questId) !== 'active') return false;
    if (!canTurnInQuest(def, this.data.inventory, this.data.questCounters)) return false;
    if (progressKindOf(def) === 'item') {
      const have = this.data.inventory[def.itemId] ?? 0;
      if (have < def.itemCount) return false;
      if (have === def.itemCount) delete this.data.inventory[def.itemId];
      else this.data.inventory[def.itemId] = have - def.itemCount;
    }
    this.data.coins += def.rewardCoins;
    for (const reward of def.rewardItems) {
      this.data.inventory[reward.id] = (this.data.inventory[reward.id] ?? 0) + reward.count;
    }
    const quests = this.data.quests ?? (this.data.quests = {});
    quests[questId] = 'completed';
    // Drop activity counters so a future repeatable quest starts clean.
    if (this.data.questCounters && questId in this.data.questCounters) {
      delete this.data.questCounters[questId];
    }
    this.data.pet.happiness = clamp(this.data.pet.happiness + 6);
    this.save();
    return true;
  }

  feedPet(foodId: string): boolean {
    const def = ITEMS[foodId];
    if (!petCanEat(def)) return false;
    if (!this.removeItem(foodId)) return false;
    applyPetFoodStats(this.data.pet, def);
    this.save();
    return true;
  }

  /**
   * Playing is its own reward: cheer the pet for a throw or a jump. Energy is
   * charged up front by the booth, so this only ever adds happiness. Pass
   * `{ persist: false }` to batch many throws and call `save()` once at stage end.
   */
  cheerFromPlay(happiness: number, opts?: { persist?: boolean }) {
    this.data.pet.happiness = clamp(this.data.pet.happiness + happiness);
    if (opts?.persist !== false) this.save();
  }

  petSleep() {
    // Full rest, but waking up a bit peckish and only slightly less cheerful.
    this.data.pet.energy = 100;
    this.data.pet.hunger = clamp(this.data.pet.hunger - 25);
    this.data.pet.happiness = clamp(this.data.pet.happiness - 8);
    this.save();
  }

  rememberTownPosition(position: TownPosition) {
    const normalized = normalizeTownPosition(position);
    if (!normalized) return;
    const current = this.data.townPosition;
    if (
      current?.x === normalized.x &&
      current.y === normalized.y &&
      current.facing === normalized.facing
    ) return;
    this.data.townPosition = normalized;
    this.townPositionDirty = true;
  }

  persistTownPosition(flushCloud = false): boolean {
    if (!this.townPositionDirty) return false;
    this.save();
    if (flushCloud) this.flushCloud();
    return true;
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

  async adopt(species: PetSpecies, name: string) {
    const trimmed = validatePetName(name);
    const previous = structuredClone(this.data);
    this.data.petSpecies = species;
    this.data.petName = trimmed;
    this.data.adopted = true;
    // Fresh needs for the new companion — village progress is untouched.
    this.data.pet = { hunger: 80, happiness: 80, energy: 90 };
    if (species === 'bongbongee') {
      // Starter outfit for a newly adopted Bongbongee — further pieces are
      // sold at Cafe Cinnamon (the town NPC no longer gifts clothes).
      this.grantAllBongbongeeAccessories();
      this.data.equippedAccessories = {
        headLeft: 'aqua-clip',
        headRight: 'mint-puff',
        body: 'diamond-tee',
      };
    } else {
      // Drop anything the previous pet was wearing that this one can't.
      this.stripUnwearableAccessories();
    }
    try {
      await this.adoptionSaver?.(this.snapshot());
    } catch (error) {
      this.data = previous;
      this.persistLocal();
      throw error;
    }
    this.save();
    // Adoption is a milestone — push it to the cloud immediately instead of
    // trusting the debounce to survive a quick tab close.
    this.flushCloud();
    this.publishMultiplayerProfileChanged();
  }

  private publishMultiplayerProfileChanged() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(MULTIPLAYER_PROFILE_CHANGED_EVENT));
    }
  }

  applyCanonicalPetName(expectedName: string, canonicalName: string) {
    if (!this.data.adopted || this.data.petName !== expectedName || expectedName === canonicalName) return false;
    this.data.petName = canonicalName;
    this.persistLocal();
    return true;
  }

  renamePet(name: string) {
    const trimmed = validatePetName(name);
    this.data.petName = trimmed;
    this.save();
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

  /** Whether the current pet species may wear this item. */
  canWearAccessory(id: AccessoryId): boolean {
    const def = ACCESSORIES[id];
    if (!def) return false;
    const wear = accessoryWearable(def);
    // Penguin gear belongs to the player — no pet may wear it.
    if (wear === 'penguin') return false;
    const species = this.data.petSpecies;
    if (wear === 'puffle') return isPuffleSpecies(species);
    if (wear === 'classic') return isClassicSpecies(species);
    return species === wear;
  }

  /** Whether this item goes on the player's penguin (vs a pet). */
  isPenguinAccessory(id: AccessoryId): boolean {
    const def = ACCESSORIES[id];
    return !!def && accessoryWearable(def) === 'penguin';
  }

  isPenguinAccessoryEquipped(id: AccessoryId): boolean {
    const slot = ACCESSORIES[id].slot;
    return (this.data.equippedPenguinAccessories ?? {})[slot] === id;
  }

  togglePenguinAccessory(id: AccessoryId) {
    if (!this.ownsAccessory(id) || !this.isPenguinAccessory(id)) return;
    const slot = ACCESSORIES[id].slot;
    const fit = (this.data.equippedPenguinAccessories ??= {});
    if (fit[slot] === id) delete fit[slot];
    else fit[slot] = id;
    this.save();
  }

  equippedPenguinAccessoryIds(): AccessoryId[] {
    const ids: AccessoryId[] = [];
    for (const id of Object.values(this.data.equippedPenguinAccessories ?? {})) {
      if (id && this.isPenguinAccessory(id)) ids.push(id);
    }
    return ids;
  }

  /** Remove equipped items the active pet is not allowed to wear. */
  stripUnwearableAccessories() {
    let changed = false;
    for (const slot of Object.keys(this.data.equippedAccessories) as AccessorySlot[]) {
      const id = this.data.equippedAccessories[slot];
      if (id && !this.canWearAccessory(id)) {
        delete this.data.equippedAccessories[slot];
        changed = true;
      }
    }
    if (changed) this.save();
  }

  grantAccessory(id: AccessoryId) {
    if (!this.data.ownedAccessories.includes(id)) {
      this.data.ownedAccessories.push(id);
      this.save();
    }
  }

  /** Buy a priced accessory. Returns false if can't afford / already owned. */
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
    if (!this.canWearAccessory(id)) return;
    const slot = ACCESSORIES[id].slot;
    if (this.data.equippedAccessories[slot] === id) {
      delete this.data.equippedAccessories[slot];
    } else {
      this.data.equippedAccessories[slot] = id;
    }
    this.save();
    this.publishMultiplayerProfileChanged();
  }

  unequipAllAccessories() {
    this.unequipAllPetAccessories(false);
    this.unequipAllPenguinAccessories(false);
    this.save();
    this.publishMultiplayerProfileChanged();
  }

  unequipAllPetAccessories(save = true) {
    this.data.equippedAccessories = {};
    if (save) {
      this.save();
      this.publishMultiplayerProfileChanged();
    }
  }

  unequipAllPenguinAccessories(save = true) {
    this.data.equippedPenguinAccessories = {};
    if (save) this.save();
  }

  equippedAccessoryIds(): AccessoryId[] {
    const ids: AccessoryId[] = [];
    for (const id of Object.values(this.data.equippedAccessories)) {
      if (id && this.canWearAccessory(id)) ids.push(id);
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
