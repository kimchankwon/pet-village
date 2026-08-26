import { migratePetSpecies } from './pets';
import type { SaveData } from './GameState';

/**
 * A cloud save row, as `saves.getMine` returns it.
 *
 * Deliberately structural rather than the generated Convex type: this module is
 * the seam between the two shapes, and it has to be importable by a plain node
 * test with no codegen in reach.
 */
export type CloudSaveRow = {
  version: number;
  coins: number;
  petName: string;
  petSpecies?: string;
  adopted?: boolean;
  pet: SaveData['pet'];
  lastSeen: number;
  inventory: Record<string, number>;
  placed: SaveData['placed'];
  bestPaperToss: number;
  biggestCatch?: number;
  bestSkipRope?: number;
  expeditionWins?: Record<string, number>;
  ownedAccessories?: readonly string[];
  equippedAccessories?: Record<string, string>;
  penguinColor?: string;
  townPosition?: SaveData['townPosition'];
  quests?: Record<string, 'active' | 'completed'>;
  questCounters?: Record<string, number>;
};

/**
 * Project a cloud save onto the payload `State.hydrate` expects.
 *
 * `hydrate` *replaces* the save rather than merging into it, so anything left
 * out here is reset to its default and then written straight back up by the
 * `State.save()` that follows — a field missed here is silent data loss, not a
 * missing read. That is what happened to expedition and quest progress, which
 * the cloud has always stored and this projection used to drop, wiping both on
 * every sign-in. `cloudSaveIsFullyProjected` in the tests guards the shape.
 *
 * Device-local fields (`penguinColor` aside) are not listed on purpose: the
 * cloud does not store `npcGiftDays` or `equippedPenguinAccessories`, and
 * `hydrate` carries those across itself.
 */
export function hydrationFromCloudSave(
  cloudSave: CloudSaveRow,
  localBestSkipRope: number,
): Partial<SaveData> {
  return {
    version: cloudSave.version,
    coins: cloudSave.coins,
    petName: cloudSave.petName,
    petSpecies: migratePetSpecies(cloudSave.petSpecies),
    adopted: cloudSave.adopted,
    pet: cloudSave.pet,
    lastSeen: cloudSave.lastSeen,
    inventory: cloudSave.inventory,
    placed: cloudSave.placed,
    bestPaperToss: cloudSave.bestPaperToss,
    biggestCatch: cloudSave.biggestCatch ?? 0,
    // Keep the better personal best if the device scored offline.
    bestSkipRope: Math.max(localBestSkipRope, cloudSave.bestSkipRope ?? 0),
    expeditionWins: cloudSave.expeditionWins,
    ownedAccessories: cloudSave.ownedAccessories as SaveData['ownedAccessories'] | undefined,
    equippedAccessories: cloudSave.equippedAccessories as SaveData['equippedAccessories'] | undefined,
    penguinColor: cloudSave.penguinColor,
    townPosition: cloudSave.townPosition,
    quests: cloudSave.quests,
    questCounters: cloudSave.questCounters,
  };
}
