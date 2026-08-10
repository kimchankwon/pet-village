import type Phaser from 'phaser';
import type { RemoteNpc } from './multiplayerBridge';
import { MINITEEN, MiniteenNpc } from './miniteen';

/** How long a villager takes to fade in on arrival, or out when their shift ends. */
export const MINITEEN_FADE_MS = 500;

/**
 * Renders the Town roster selected and moved by the multiplayer server.
 * The browser never chooses residents or advances their patrol positions
 * while multiplayer is live.
 *
 * When multiplayer is offline (guest, server down, reconnect gap with no
 * prior snapshot), {@link syncLocal} walks the same clock roster with local AI
 * so Town is never an empty plaza.
 *
 * The server rotates the roster while the scene is open, so this also owns the
 * comings and goings: an arrival fades in, a departure fades out and is only
 * then destroyed, and nobody is retired out from under a player who is in the
 * middle of talking to them.
 */
export class MiniteenRoster {
  private readonly active = new Map<string, MiniteenNpc>();
  /** Fading out: still drawn, no longer available to talk to. */
  private readonly leaving = new Set<string>();
  /** True while driving from {@link syncLocal} instead of server poses. */
  private localMode = false;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Solo / offline: local waypoint patrol for these resident ids. */
  syncLocal(ids: readonly string[]) {
    this.localMode = true;
    const idSet = new Set(ids);

    for (const [id, npc] of this.active) {
      if (idSet.has(id)) {
        this.cancelDeparture(id, npc);
        // Drop any leftover server pose control so they walk again.
        npc.setLocalControl(true);
        continue;
      }
      if (npc.isConversing()) continue;
      this.retire(id, npc);
    }

    for (const id of ids) {
      const definitionIndex = MINITEEN.findIndex((definition) => definition.id === id);
      const definition = MINITEEN[definitionIndex];
      if (!definition) continue;
      let npc = this.active.get(id);
      if (!npc) {
        npc = new MiniteenNpc(this.scene, definition, definitionIndex);
        this.active.set(id, npc);
        this.fade(npc, 0, 1);
      }
      npc.setLocalControl(true);
    }
  }

  sync(rows: RemoteNpc[]) {
    this.localMode = false;
    const knownRows = rows.filter((row) => MINITEEN.some((definition) => definition.id === row.id));
    const ids = new Set(knownRows.map((row) => row.id));

    for (const [id, npc] of this.active) {
      if (ids.has(id)) {
        this.cancelDeparture(id, npc);
        continue;
      }
      // A conversation outlives the shift: the next sync retires them instead.
      if (npc.isConversing()) continue;
      this.retire(id, npc);
    }

    for (const row of knownRows) {
      const definitionIndex = MINITEEN.findIndex((definition) => definition.id === row.id);
      const definition = MINITEEN[definitionIndex];
      if (!definition) continue;
      let npc = this.active.get(row.id);
      if (!npc) {
        npc = new MiniteenNpc(this.scene, definition, definitionIndex);
        this.active.set(row.id, npc);
        this.fade(npc, 0, 1);
      }
      npc.setNetworkPose(row);
    }
  }

  isLocalMode() {
    return this.localMode;
  }

  private fade(npc: MiniteenNpc, from: number, to: number, onComplete?: () => void) {
    npc.sprite.setAlpha(from);
    this.scene.tweens.add({
      targets: npc.sprite,
      alpha: to,
      duration: MINITEEN_FADE_MS,
      onComplete,
    });
  }

  private retire(id: string, npc: MiniteenNpc) {
    if (this.leaving.has(id)) return;
    this.leaving.add(id);
    this.fade(npc, npc.sprite.alpha, 0, () => {
      this.leaving.delete(id);
      if (this.active.get(id) !== npc) return;
      this.active.delete(id);
      npc.destroy();
    });
  }

  /** The server put them back on the roster before the fade finished. */
  private cancelDeparture(id: string, npc: MiniteenNpc) {
    if (!this.leaving.delete(id)) return;
    this.scene.tweens.killTweensOf(npc.sprite);
    this.fade(npc, npc.sprite.alpha, 1);
  }

  /** NPCs currently synchronized into Town (for interaction and rendering). */
  list(): MiniteenNpc[] {
    return [...this.active.values()].filter(
      (npc) => npc.isPresent() && !this.leaving.has(npc.defId),
    );
  }

  update() {
    for (const npc of this.active.values()) npc.update();
  }
}
