import type { FunctionReturnType } from 'convex/server';
import { migratePetSpecies } from './pets';
import type { api } from '../../convex/_generated/api';
import type { SaveData } from './GameState';

/**
 * A cloud save row, minus the fields that belong to the document rather than to
 * the player's progress.
 *
 * Derived from the query's own return type rather than hand-written, so a column
 * added to the `saves` table in `convex/schema.ts` lands here on its own — the
 * generated data model reads that schema directly, with no codegen step in
 * between. That is what makes the fixture in the tests, declared
 * `Required<CloudSaveRow>`, fail to compile until the new field is accounted
 * for, and the projection test fail until it is actually carried across.
 */
export type CloudSaveRow = Omit<
  NonNullable<FunctionReturnType<typeof api.saves.getMine>>,
  '_id' | '_creationTime' | 'userId' | 'updatedAt'
>;

/**
 * Project a cloud save onto the payload `State.hydrate` expects.
 *
 * `hydrate` *replaces* the save rather than merging into it, so anything left
 * out here is reset to its default and then written straight back up by the
 * `State.save()` that follows — a field missed here is silent data loss, not a
 * missing read. That is what happened to expedition and quest progress, which
 * the cloud has always stored and this projection used to drop, wiping both on
 * every sign-in. The tests guard the shape from both ends: the fixture cannot
 * compile while a cloud field is unaccounted for, and the projection test walks
 * the row's own keys.
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
