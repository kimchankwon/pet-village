import { Room, type Client, ServerError } from '@colyseus/core';
import { jwtVerify } from 'jose';
import {
  PROTOCOL_VERSION,
  TOWN_BOUNDS,
  WORLD_SCENE_SPAWNS,
  TICKET_AUDIENCE,
  TICKET_ISSUER,
  PlayerState,
  TownState,
  isGameActivity,
  isWorldScene,
  sanitizeChatText,
  type ActivityPayload,
  type AdmissionClaims,
  type ChatPayload,
  type ProfileRefreshPayload,
  type ProfileRefreshResult,
  type WavePayload,
  type WorldScene,
} from '@pet-village/multiplayer-protocol';
import { canChat, canTransitionWorldScene, canWave, isApprovedWorldSpawn, TOWN_SPAWNS, validateMove } from './policy.ts';
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

function validTownPosition(value: AdmissionClaims['townPosition']) {
  return value === undefined || (
    value !== null &&
    Number.isFinite(value.x) && value.x >= 0 && value.x <= TOWN_BOUNDS.width &&
    Number.isFinite(value.y) && value.y >= 0 && value.y <= TOWN_BOUNDS.height &&
    (value.facing === 'up' || value.facing === 'down' || value.facing === 'side')
  );
}

function validActivityPose(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const pose = value as NonNullable<ActivityPayload['pose']>;
  return [pose.x, pose.y, pose.petX, pose.petY].every(Number.isFinite) &&
    (pose.facing === 'up' || pose.facing === 'down' || pose.facing === 'side') &&
    typeof pose.moving === 'boolean' &&
    Math.hypot(pose.petX - pose.x, pose.petY - pose.y) <= 160;
}

function validEquippedAccessories(value: AdmissionClaims['equippedAccessories']) {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return (['headLeft', 'headRight', 'body', 'extra'] as const).every((slot) => {
    const id = value[slot];
    return id === undefined || (typeof id === 'string' && id.length <= 64);
  });
}

function accessoryFields(claims: AdmissionClaims) {
  return {
    accessoryHeadLeft: claims.equippedAccessories?.headLeft ?? '',
    accessoryHeadRight: claims.equippedAccessories?.headRight ?? '',
    accessoryBody: claims.equippedAccessories?.body ?? '',
    accessoryExtra: claims.equippedAccessories?.extra ?? '',
  };
}

const PENGUIN_COLORS = new Set([
  'blue', 'green', 'pink', 'black', 'red', 'purple',
  'orange', 'darkpurple', 'brown', 'peach', 'darkgreen', 'lightblue',
]);

// Four ticket versions are retained by the rolling-compatibility policy.
const SUPPORTED_PROTOCOL_VERSIONS = new Set<number>([4, 5, 6, PROTOCOL_VERSION]);

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
    !validEquippedAccessories(claims.equippedAccessories) ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 65
  ) {
    throw new Error('Invalid admission claims');
  }
  return validTownPosition(claims.townPosition)
    ? claims
    : { ...claims, townPosition: undefined };
}

export class TownRoom extends Room<{ state: TownState }> {
  maxClients = 100;
  private readonly reentrySessions = new Map<string, WorldScene>();
  private readonly restoringSessions = new Set<string>();
  private readonly lastProfileRefreshAt = new Map<string, number>();
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
    this.onMessage('move', (client, payload: unknown) => this.move(client, payload));
    this.onMessage('active', (client, active: unknown) => this.setActive(client, active));
    this.onMessage('activity', (client, activity: unknown) => this.setActivity(client, activity));
    this.onMessage('profile', (client, payload: ProfileRefreshPayload) => {
      void this.refreshProfile(client, payload);
    });
    this.onMessage('wave', (client, payload: WavePayload) => this.wave(client, payload));
    this.onMessage('chat', (client, payload: ChatPayload) => this.chat(client, payload));
  }

  onJoin(client: Client, _options: unknown, claims: AdmissionClaims) {
    const player = new PlayerState();
    const spawn = claims.townPosition ?? { ...TOWN_SPAWNS[0], facing: 'down' as const };
    Object.assign(player, {
      userId: claims.sub,
      displayName: claims.displayName,
      petName: claims.petName,
      petSpecies: claims.petSpecies,
      penguinColor: claims.penguinColor,
      ...accessoryFields(claims),
      x: spawn.x,
      y: spawn.y,
      petX: spawn.x - 30,
      petY: spawn.y + 10,
      facing: spawn.facing,
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
    this.restoringSessions.delete(client.sessionId);
    void this.allowReconnection(client, 20).catch(() => undefined);
  }

  onReconnect(client: Client) {
    this.restoringSessions.add(client.sessionId);
  }

  onLeave(client: Client) {
    this.reentrySessions.delete(client.sessionId);
    this.restoringSessions.delete(client.sessionId);
    this.lastProfileRefreshAt.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
  }

  private move(client: Client, payload: unknown) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!player.active || player.activity) {
      player.moving = false;
      client.send('positionCorrection', {
        scene: player.scene,
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
        scene: player.scene,
        x: player.x,
        y: player.y,
        lastSeq: player.seq,
        lastMoveAt: player.updatedAt,
        lastWaveAt: 0,
      },
      payload,
      now,
      this.reentrySessions.get(client.sessionId) ?? false,
    );
    if (!result.ok) {
      client.send('positionCorrection', {
        scene: player.scene,
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

  private setActive(client: Client, value: unknown) {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    const candidate = value && typeof value === 'object'
      ? value as Partial<ActivityPayload>
      : null;
    const payload: ActivityPayload | null = typeof value === 'boolean'
      ? { active: value, scene: 'town' }
      : candidate &&
          typeof candidate.active === 'boolean' &&
          isWorldScene(candidate.scene) &&
          (candidate.pose === undefined || validActivityPose(candidate.pose))
        ? candidate as ActivityPayload
        : null;
    if (!payload) return;

    const restoring = this.restoringSessions.has(client.sessionId);
    const changingScene = payload.active && payload.scene !== player.scene;
    if (changingScene && (
      !canTransitionWorldScene(player.scene, payload.scene) ||
      (payload.pose && !isApprovedWorldSpawn(payload.scene, payload.pose.x, payload.pose.y))
    )) {
      client.send('positionCorrection', {
        scene: player.scene,
        x: player.x,
        y: player.y,
        petX: player.petX,
        petY: player.petY,
        recoverScene: true,
      });
      return;
    }
    this.restoringSessions.delete(client.sessionId);
    const restoringSameScene = restoring && !changingScene;
    const entering = payload.active && (!player.active || changingScene);
    if (entering && player.seq > 0 && !restoringSameScene) {
      this.reentrySessions.set(client.sessionId, payload.scene);
    } else if (restoringSameScene) {
      this.reentrySessions.delete(client.sessionId);
    }
    // Activation poses are transition-only. Reapplying a same-scene pose would
    // create an unrestricted teleport path around the movement policy.
    if (changingScene) {
      player.scene = payload.scene;
      const defaultSpawn = WORLD_SCENE_SPAWNS[payload.scene][0];
      const spawn = payload.pose ?? {
        x: defaultSpawn.x,
        y: defaultSpawn.y,
        petX: defaultSpawn.x - 30,
        petY: defaultSpawn.y + 10,
        facing: 'down' as const,
        moving: false,
      };
      player.x = spawn.x;
      player.y = spawn.y;
      player.petX = spawn.petX;
      player.petY = spawn.petY;
      player.facing = spawn.facing;
      player.moving = spawn.moving;
    }
    player.active = payload.active;
    player.moving = payload.active ? player.moving : false;
    if (payload.active) player.activity = '';
    player.updatedAt = Date.now();
  }

  private async refreshProfile(client: Client, payload: ProfileRefreshPayload) {
    const requestId = typeof payload?.requestId === 'string' && payload.requestId.length <= 128
      ? payload.requestId
      : undefined;
    const reply = (ok: boolean, retryAfterMs?: number) => client.send('profileRefreshed', {
      ok,
      ...(requestId ? { requestId } : {}),
      ...(retryAfterMs ? { retryAfterMs } : {}),
    } satisfies ProfileRefreshResult);
    if (!payload || typeof payload.ticket !== 'string' || payload.ticket.length === 0 || payload.ticket.length > 8_192) {
      reply(false);
      return;
    }
    const now = Date.now();
    const elapsed = now - (this.lastProfileRefreshAt.get(client.sessionId) ?? 0);
    if (elapsed < 200) {
      reply(false, 200 - elapsed);
      return;
    }
    this.lastProfileRefreshAt.set(client.sessionId, now);
    try {
      const claims = await verifyAdmission(payload.ticket);
      const player = this.state.players.get(client.sessionId);
      if (!player || claims.sub !== player.userId) {
        reply(false);
        return;
      }
      Object.assign(player, {
        displayName: claims.displayName,
        petName: claims.petName,
        petSpecies: claims.petSpecies,
        penguinColor: claims.penguinColor,
        ...accessoryFields(claims),
        updatedAt: Date.now(),
      });
      reply(true);
    } catch {
      reply(false);
    }
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
      player.scene !== target.scene ||
      !player.active ||
      !target.active ||
      !canWave({ x: player.x, y: player.y, lastWaveAt }, target, now)
    ) {
      return;
    }
    player.waveId = `${now}:${crypto.randomUUID()}`;
    player.waveTarget = payload.targetSessionId;
  }

  /**
   * Say something over your penguin's head. Whoever shares the scene sees it, so
   * the text is sanitized here rather than trusted from the sender, and the id
   * carries the send time — that is what rate-limits the next one.
   */
  private chat(client: Client, payload: ChatPayload) {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.active) return;
    const text = sanitizeChatText(payload?.text);
    const now = Date.now();
    const lastChatAt = Number(player.chatId.split(':')[0]) || 0;
    if (!text || !canChat({ lastChatAt }, now)) return;
    player.chatText = text;
    player.chatId = `${now}:${crypto.randomUUID()}`;
  }
}
