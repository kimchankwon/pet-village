/**
 * Persist town NPC positions across interior visits so villagers don't
 * teleport home every time you enter/leave a building.
 */
import type { MiniteenNpc } from './miniteen';
import type { WandererNpc } from './WandererNpc';

export type TownNpcSnap = {
  id: string;
  x: number;
  y: number;
};

let bongSnap: TownNpcSnap | null = null;
let miniteenSnaps: TownNpcSnap[] | null = null;

export function rememberBongbongee(npc: WandererNpc) {
  if (!npc.sprite?.active) return;
  bongSnap = { id: 'bongbongee', x: npc.sprite.x, y: npc.sprite.y };
}

export function rememberMiniteens(npcs: MiniteenNpc[]) {
  miniteenSnaps = npcs
    .filter((n) => n.isPresent())
    .map((n) => ({
      id: n.defId,
      x: n.sprite.x,
      y: n.sprite.y,
    }));
}

export function takeBongbongeeSnap(): TownNpcSnap | null {
  return bongSnap;
}

export function takeMiniteenSnaps(): TownNpcSnap[] | null {
  return miniteenSnaps;
}
