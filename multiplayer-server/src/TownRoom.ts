import { Room, type Client, ServerError } from '@colyseus/core';
import { jwtVerify } from 'jose';
import {
  PROTOCOL_VERSION,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
  PlayerState,
  TownState,
  isGameActivity,
  type AdmissionClaims,
  type MovePayload,
  type WavePayload,
} from '@pet-village/multiplayer-protocol';
import { canWave, TOWN_SPAWNS, validateMove } from './policy.ts';
import { TownNpcSimulation } from './npcSimulation.ts';

function secret() {
  const value = process.env.MULTIPLAYER_TICKET_SECRET;
  if (!value || value.length < 32) {
    throw new Error('MULTIPLAYER_TICKET_SECRET must be at least 32 characters');
  }
  return new TextEncoder().encode(value);
}

function validClaimString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

const PENGUIN_COLORS = new Set([
  'blue', 'green', 'pink', 'black', 'red', 'purple',
  'orange', 'darkpurple', 'brown', 'peach', 'darkgreen', 'lightblue',
]);

// Version 2 clients ignore the additive activity field, so keep them admitted while
// protocol 3 rolls out server-first; remove version 2 after the migration window.
const SUPPORTED_PROTOCOL_VERSIONS = new Set<number>([2, PROTOCOL_VERSION]);

export async function verifyAdmission(token: string): Promise<AdmissionClaims> {
  const { payload } = await jwtVerify(token, secret(), {
    algorithms: ['HS256'],
    issuer: TICKET_ISSUER,
    audience: TICKET_AUDIENCE,
    clockTolerance: 5,
  });
  const claims = payload as unknown as AdmissionClaims;
  if (
    !SUPPORTED_PROTOCOL_VERSIONS.has(claims.protocolVersion) ||
    !validClaimString(claims.sub, 256) ||
    !validClaimString(claims.jti, 128) ||
    !validClaimString(claims.displayName, 32) ||
    !validClaimString(claims.petName, 32) ||
    !validClaimString(claims.petSpecies, 40) ||
    !validClaimString(claims.penguinColor, 24) ||
    !PENGUIN_COLORS.has(claims.penguinColor) ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 65
  ) {
    throw new Error('Invalid admission claims');
  }
  return claims;
}

export class TownRoom extends Room<{ state: TownState }> {
  maxClients = 100;
  private readonly reentrySessions = new Set<string>();
  private npcSimulation?: TownNpcSimulation;
  state = new TownState();

  async onAuth(_client: Client, _options: unknown, context: { token?: string }) {
    try {
      return await verifyAdmission(context.token ?? '');
    } catch {
      throw new ServerError(401, 'Invalid or expired admission ticket');
    }
  }

  onCreate() {
    this.npcSimulation = new TownNpcSimulation(this.state.npcs);
    this.setSimulationInterval((deltaMs) => this.npcSimulation?.step(deltaMs), 100);
    this.onMessage('move', (client, payload: MovePayload) => this.move(client, payload));
    this.onMessage('active', (client, active: unknown) => this.setActive(client, active));
    this.onMessage('activity', (client, activity: unknown) => this.setActivity(client, activity));
    this.onMessage('wave', (client, payload: WavePayload) => this.wave(client, payload));
  }

  onJoin(client: Client, _options: unknown, claims: AdmissionClaims) {
    const player = new PlayerState();
    Object.assign(player, {
      userId: claims.sub,
      displayName: claims.displayName,
      petName: claims.petName,
      petSpecies: claims.petSpecies,
      penguinColor: claims.penguinColor,
      x: TOWN_SPAWNS[0].x,
      y: TOWN_SPAWNS[0].y,
      petX: TOWN_SPAWNS[0].x - 30,
      petY: TOWN_SPAWNS[0].y + 10,
      updatedAt: Date.now(),
    });
    this.state.players.set(client.sessionId, player);
  }

  onDrop(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.active = false;
      player.activity = '';
      player.moving = false;
      player.updatedAt = Date.now();
    }
    this.reentrySessions.delete(client.sessionId);
    void this.allowReconnection(client, 20).catch(() => undefined);
  }

  onLeave(client: Client) {
    this.reentrySessions.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  private move(client: Client, payload: MovePayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!player.active || player.activity) {
      player.moving = false;
      client.send('positionCorrection', {
        x: player.x,
        y: player.y,
        petX: player.petX,
        petY: player.petY,
      });
      return;
    }

    const now = Date.now();
    const result = validateMove(
      {
        x: player.x,
        y: player.y,
        lastSeq: player.seq,
        lastMoveAt: player.updatedAt,
        lastWaveAt: 0,
      },
      payload,
      now,
      this.reentrySessions.has(client.sessionId),
    );
    if (!result.ok) {
      client.send('positionCorrection', {
        x: player.x,
        y: player.y,
        petX: player.petX,
        petY: player.petY,
      });
      return;
    }
    this.reentrySessions.delete(client.sessionId);
    Object.assign(player, result.move, { updatedAt: now });
  }

  private setActive(client: Client, active: unknown) {
    const player = this.state.players.get(client.sessionId);
    if (!player || typeof active !== 'boolean') return;
    if (active && !player.active && player.seq > 0) this.reentrySessions.add(client.sessionId);
    player.active = active;
    player.moving = active ? player.moving : false;
    if (active) player.activity = '';
    player.updatedAt = Date.now();
  }

  private setActivity(client: Client, activity: unknown) {
    const player = this.state.players.get(client.sessionId);
    if (!player || (activity !== '' && !isGameActivity(activity))) return;
    player.activity = activity;
    if (activity) {
      player.active = false;
      player.moving = false;
    }
    player.updatedAt = Date.now();
  }

  private wave(client: Client, payload: WavePayload) {
    const player = this.state.players.get(client.sessionId);
    const target = this.state.players.get(payload?.targetSessionId);
    const now = Date.now();
    const lastWaveAt = Number(player?.waveId.split(':')[0]) || 0;
    if (
      !player ||
      !target ||
      !player.active ||
      !target.active ||
      !canWave({ x: player.x, y: player.y, lastWaveAt }, target, now)
    ) {
      return;
    }
    player.waveId = `${now}:${crypto.randomUUID()}`;
    player.waveTarget = payload.targetSessionId;
  }
}
