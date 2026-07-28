import { Room, ServerError, type Client } from '@colyseus/core';
import {
  PROTOCOL_VERSION,
  SLED_MAX_PLAYERS,
  SLED_TICK_MS,
  SledRunState,
  type AdmissionClaims,
  type SledHitPayload,
  type SledHitRejectedPayload,
  type SledInputPayload,
} from '@pet-village/multiplayer-protocol';
import { verifyAdmission } from './TownRoom.ts';
import { SledRaceSimulation } from './sledSimulation.ts';

export class SledRunRoom extends Room<{ state: SledRunState }> {
  maxClients = SLED_MAX_PLAYERS;
  state = new SledRunState();
  private simulation?: SledRaceSimulation;
  private matchmakingLocked = false;

  async onAuth(_client: Client, _options: unknown, context: { token?: string }) {
    let claims: AdmissionClaims;
    try {
      claims = await verifyAdmission(context.token ?? '');
    } catch {
      throw new ServerError(401, 'Invalid or expired admission ticket');
    }
    if (claims.protocolVersion !== PROTOCOL_VERSION) {
      throw new ServerError(426, `Sled Run requires protocol ${PROTOCOL_VERSION}`);
    }
    return claims;
  }

  onCreate() {
    this.simulation = new SledRaceSimulation(this.state);
    this.setSimulationInterval((deltaMs) => {
      this.simulation?.step(deltaMs);
      this.flushRejectedClaims();
      if (this.state.phase === 'finished' && this.matchmakingLocked) {
        this.releaseMatchmakingLock();
      }
    }, SLED_TICK_MS);
    this.onMessage('sled:difficulty', (client, difficulty: unknown) => {
      this.simulation?.setDifficulty(client.sessionId, difficulty);
    });
    this.onMessage('sled:start', (client) => {
      if (!this.simulation?.start(client.sessionId)) return;
      this.matchmakingLocked = true;
      void this.lock().catch(() => { this.matchmakingLocked = false; });
    });
    this.onMessage('sled:input', (client, payload: SledInputPayload) => {
      this.simulation?.input(client.sessionId, payload);
    });
    // Collisions are called by the racer's own client, against the lane it is
    // really steering; the room keeps the verdict for the other sleds' view and
    // checks it against the racer's steering history as the sled goes past.
    this.onMessage('sled:hit', (client, payload: SledHitPayload) => {
      this.simulation?.hit(client.sessionId, payload);
      this.flushRejectedClaims();
    });
  }

  /**
   * Tell clients about claims the server would not keep, so the one that made it
   * can drop the effect it already showed rather than run the rest of the race a
   * boost or a bump out of step with everyone else.
   */
  private flushRejectedClaims() {
    for (const claim of this.simulation?.takeRejectedClaims() ?? []) {
      const payload: SledHitRejectedPayload = { itemId: claim.itemId };
      this.clients.getById(claim.sessionId)?.send('sled:hit:rejected', payload);
    }
  }

  onJoin(client: Client, _options: unknown, claims: AdmissionClaims) {
    const sim = this.simulation;
    if (!sim) throw new ServerError(500, 'Room not initialized');
    const duplicateUser = [...this.state.racers.entries()].some(
      ([sessionId, racer]) => sessionId !== client.sessionId && racer.userId === claims.sub,
    );
    if (duplicateUser) throw new ServerError(409, 'User is already in this Sled Run');
    if (this.state.racers.size >= SLED_MAX_PLAYERS) {
      throw new ServerError(403, 'Sled Run lobby is full');
    }

    const profile = {
      userId: claims.sub,
      displayName: claims.displayName ?? claims.sub,
      penguinColor: claims.penguinColor ?? 'blue',
    };
    if (!sim.join(client.sessionId, profile)) {
      throw new ServerError(403, 'Room already started');
    }
    this.state.racers.get(client.sessionId)!.steering = 0;
  }

  onDrop(client: Client) {
    const racer = this.state.racers.get(client.sessionId);
    if (racer) this.simulation?.stopInput(client.sessionId);
    void this.allowReconnection(client, 20).catch(() => undefined);
  }

  onLeave(client: Client) {
    this.simulation?.leave(client.sessionId);
    if (this.state.phase === 'lobby' && this.state.racers.size === 0) {
      this.releaseMatchmakingLock();
    }
  }

  private releaseMatchmakingLock() {
    if (!this.matchmakingLocked) return;
    this.matchmakingLocked = false;
    void this.unlock().catch(() => undefined);
  }
}
