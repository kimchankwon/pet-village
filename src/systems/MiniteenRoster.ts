import type Phaser from 'phaser';
import type { RemoteNpc } from './multiplayerBridge';
import { MINITEEN, MiniteenNpc } from './miniteen';

/**
 * Renders the Town roster selected and moved by the multiplayer server.
 * The browser never chooses residents or advances their patrol positions.
 */
export class MiniteenRoster {
  private readonly active = new Map<string, MiniteenNpc>();

  constructor(private readonly scene: Phaser.Scene) {}

  sync(rows: RemoteNpc[]) {
    const knownRows = rows.filter((row) => MINITEEN.some((definition) => definition.id === row.id));
    const ids = new Set(knownRows.map((row) => row.id));

    for (const [id, npc] of this.active) {
      if (ids.has(id)) continue;
      npc.destroy();
      this.active.delete(id);
    }

    for (const row of knownRows) {
      const definitionIndex = MINITEEN.findIndex((definition) => definition.id === row.id);
      const definition = MINITEEN[definitionIndex];
      if (!definition) continue;
      let npc = this.active.get(row.id);
      if (!npc) {
        npc = new MiniteenNpc(this.scene, definition, definitionIndex);
        this.active.set(row.id, npc);
      }
      npc.setNetworkPose(row);
    }
  }

  /** NPCs currently synchronized into Town (for interaction and rendering). */
  list(): MiniteenNpc[] {
    return [...this.active.values()].filter((npc) => npc.isPresent());
  }

  update() {
    for (const npc of this.active.values()) npc.update();
  }
}
