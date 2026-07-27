import { Room, type Client, ServerError } from '@colyseus/core';
import { jwtVerify } from 'jose';
import {
  PROTOCOL_VERSION,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
  PlayerState,
  TownState,
  type AdmissionClaims,
  type MovePayload,
  type WavePayload,
} from '@pet-village/multiplayer-protocol';
import { canWave, validateMove } from './policy.ts';

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

export async function verifyAdmission(token: string): Promise<AdmissionClaims> {
  const { payload } = await jwtVerify(token, secret(), {
    algorithms: ['HS256'],
    issuer: TICKET_ISSUER,
    audience: TICKET_AUDIENCE,
    clockTolerance: 5,
  });
  const claims = payload as unknown as AdmissionClaims;
  if (
    claims.protocolVersion !== PROTOCOL_VERSION ||
    !validClaimString(claims.sub, 256) ||
    !validClaimString(claims.jti, 128) ||
    !validClaimString(claims.displayName, 32) ||
    !validClaimString(claims.petName, 32) ||
    !validClaimString(claims.petSpecies, 40) ||
    !validClaimString(claims.penguinColor, 24) ||
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
  state = new TownState();

  async onAuth(_client: Client, _options: unknown, context: { token?: string }) {
    try {
      return await verifyAdmission(context.token ?? '');
    } catch {
      throw new ServerError(401, 'Invalid or expired admission ticket');
    }
  }

  onCreate() {
    this.onMessage('move', (client, payload: MovePayload) => this.move(client, payload));
    this.onMessage('active', (client, active: unknown) => this.setActive(client, active));
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
      x: 528,
      y: 500,
      petX: 498,
      petY: 510,
      updatedAt: Date.now(),
    });
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
  }

  private move(client: Client, payload: MovePayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

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
    );
    if (!result.ok) return;
    Object.assign(player, result.move, { updatedAt: now });
  }

  private setActive(client: Client, active: unknown) {
    const player = this.state.players.get(client.sessionId);
    if (!player || typeof active !== 'boolean') return;
    if (active && !player.active) {
      player.seq = 0;
      player.updatedAt = Date.now();
    }
    player.active = active;
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
