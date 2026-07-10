// Central game state with localStorage + optional Convex cloud sync.
// Pet needs decay is computed from timestamps, so the pet keeps "living"
// while the game is closed — the Tamagotchi mechanic.

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
}

export const ITEMS: Record<string, ItemDef> = {
  fish: { id: 'fish', name: 'Fishy Snack', texture: 'fish', kind: 'food', price: 5, hunger: 25, happiness: 5 },
  cookie: { id: 'cookie', name: 'Choco Cookie', texture: 'cookie', kind: 'food', price: 8, hunger: 15, happiness: 15 },
  plant: { id: 'plant', name: 'Potted Plant', texture: 'item-plant', kind: 'furniture', price: 20 },
  flower: { id: 'flower', name: 'Flower Vase', texture: 'item-flower', kind: 'furniture', price: 15 },
  chair: { id: 'chair', name: 'Cozy Chair', texture: 'item-chair', kind: 'furniture', price: 30 },
  table: { id: 'table', name: 'Wood Table', texture: 'item-table', kind: 'furniture', price: 35 },
  rug: { id: 'rug', name: 'Pink Rug', texture: 'item-rug', kind: 'furniture', price: 25 },
  lamp: { id: 'lamp', name: 'Sun Lamp', texture: 'item-lamp', kind: 'furniture', price: 22 },
  bed: { id: 'bed', name: 'Dream Bed', texture: 'item-bed', kind: 'furniture', price: 50 },
  bookshelf: { id: 'bookshelf', name: 'Bookshelf', texture: 'item-bookshelf', kind: 'furniture', price: 45 },
  tv: { id: 'tv', name: 'Retro TV', texture: 'item-tv', kind: 'furniture', price: 60 },
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
      { id: 'bed', gx: 1, gy: 1 },
      { id: 'rug', gx: 5, gy: 4 },
    ],
    bestPaperToss: 0,
  };
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
    this.data = mergeSave(raw);
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
    this.save();
    return true;
  }

  playWithPet(): boolean {
    const p = this.data.pet;
    if (p.energy < 10) return false;
    p.happiness = clamp(p.happiness + 20);
    p.energy = clamp(p.energy - 10);
    this.save();
    return true;
  }

  petSleep() {
    this.data.pet.energy = 100;
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

  adopt(species: PetSpecies, name: string) {
    const trimmed = name.trim().slice(0, 12);
    if (!trimmed) throw new Error('Name your pet');
    this.data.petSpecies = species;
    this.data.petName = trimmed;
    this.data.adopted = true;
    this.save();
  }

  /** Guest-only: wipe local progress and return to the adopt screen. */
  resetToPetSelect() {
    if (this.cloudTimer) {
      clearTimeout(this.cloudTimer);
      this.cloudTimer = null;
    }
    this.data = defaultSave();
    this.persistLocal();
    localStorage.removeItem(WELCOME_KEY);
  }
}

export const State = new GameStateStore();
