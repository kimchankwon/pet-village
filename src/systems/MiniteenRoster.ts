import Phaser from 'phaser';
import { MINITEEN, MiniteenNpc, type MiniteenDef } from './miniteen';
import { TILE, TOWN_WORLD_H, TOWN_WORLD_W } from './townMap';

const WORLD_W = TOWN_WORLD_W;
const WORLD_H = TOWN_WORLD_H;

/** How many MINITEEN are visible in town at once. */
const ACTIVE_COUNT = 4;
/** Delay between one leaving and the next entering. */
const SWAP_MS: [number, number] = [18_000, 32_000];

type Edge = 'left' | 'right' | 'top' | 'bottom';

function edgePoint(edge: Edge): { x: number; y: number } {
  switch (edge) {
    case 'left':
      return { x: -24, y: Phaser.Math.Between(5, 12) * TILE };
    case 'right':
      return { x: WORLD_W + 24, y: Phaser.Math.Between(5, 12) * TILE };
    case 'top':
      return { x: Phaser.Math.Between(3, 19) * TILE, y: -24 };
    case 'bottom':
      return { x: Phaser.Math.Between(3, 19) * TILE, y: WORLD_H + 24 };
  }
}

function randomEdge(): Edge {
  return (['left', 'right', 'top', 'bottom'] as const)[Phaser.Math.Between(0, 3)]!;
}

/**
 * Keeps only a handful of MINITEEN on the map. Others stroll off-screen;
 * a different villager walks in from another edge after a pause.
 */
export class MiniteenRoster {
  private scene: Phaser.Scene;
  private active = new Map<string, MiniteenNpc>();
  private nextSwapAt = 0;
  private swapping = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const start = Phaser.Utils.Array.Shuffle([...MINITEEN]).slice(0, ACTIVE_COUNT);
    start.forEach((def, i) => this.spawnAtHome(def, i));
    this.scheduleNext();
  }

  private scheduleNext() {
    this.nextSwapAt = this.scene.time.now + Phaser.Math.Between(SWAP_MS[0], SWAP_MS[1]);
  }

  private spawnAtHome(def: MiniteenDef, index: number) {
    const npc = new MiniteenNpc(this.scene, def, index);
    this.active.set(def.id, npc);
  }

  /** NPCs currently on the map (for interact + update). */
  list(): MiniteenNpc[] {
    return [...this.active.values()].filter((n) => n.isPresent());
  }

  update() {
    for (const npc of this.active.values()) {
      if (npc.sprite.active) npc.update();
    }
    if (this.swapping || this.scene.time.now < this.nextSwapAt) return;
    this.beginSwap();
  }

  private beginSwap() {
    const present = [...this.active.entries()].filter(([, n]) => n.canInteract());
    if (present.length === 0) return;

    const [leaveId, leaving] = present[Phaser.Math.Between(0, present.length - 1)]!;
    const offDuty = MINITEEN.filter((d) => !this.active.has(d.id));
    if (offDuty.length === 0) {
      this.scheduleNext();
      return;
    }
    const enterDef = offDuty[Phaser.Math.Between(0, offDuty.length - 1)]!;

    this.swapping = true;
    const exit = edgePoint(randomEdge());

    leaving.walkOff(exit, () => {
      leaving.destroy();
      this.active.delete(leaveId);

      const index = MINITEEN.findIndex((d) => d.id === enterDef.id);
      const incoming = new MiniteenNpc(this.scene, enterDef, Math.max(0, index));
      this.active.set(enterDef.id, incoming);
      incoming.appearFrom(edgePoint(randomEdge()), () => {
        this.swapping = false;
        this.scheduleNext();
      });
    });
  }
}
