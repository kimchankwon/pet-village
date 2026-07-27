import { MINITEEN, type MiniteenDef, type MiniteenNpc } from './miniteen';
import { NPC_SCENE_ASSIGNMENTS } from './npcAssignments';
import type { TownNpcSnap } from './townPresence';

export type NpcSceneLocation = 'shore' | 'west-green' | 'east-green';

const assignments: Record<NpcSceneLocation, readonly string[]> = NPC_SCENE_ASSIGNMENTS;

const sceneSnaps: Partial<Record<NpcSceneLocation, TownNpcSnap[]>> = {};

/** NPC definitions reserved for a non-town scene for this game session. */
export function npcDefsForScene(location: NpcSceneLocation): MiniteenDef[] {
  return assignments[location]
    .map((id) => MINITEEN.find((def) => def.id === id))
    .filter((def): def is MiniteenDef => Boolean(def));
}

/** IDs that the rotating Town roster must not use at the same time. */
export function npcIdsOutsideTown(): Set<string> {
  return new Set(Object.values(assignments).flat());
}

export function rememberSceneNpcs(location: NpcSceneLocation, npcs: MiniteenNpc[]) {
  sceneSnaps[location] = npcs
    .filter((npc) => npc.canInteract())
    .map((npc) => ({ id: npc.defId, x: npc.sprite.x, y: npc.sprite.y }));
}

export function takeSceneNpcSnaps(location: NpcSceneLocation): TownNpcSnap[] {
  return sceneSnaps[location] ?? [];
}
