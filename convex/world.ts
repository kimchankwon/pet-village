import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import {
  PROTOCOL_VERSION,
  TOWN_SPAWNS,
  WORLD_SCENE_SPAWNS,
  canChat,
  canTransitionWorldScene,
  canWave,
  isApprovedWorldSpawn,
  isFacing,
  isGameActivity,
  isPenguinEmote,
  isPetExpression,
  isWorldScene,
  sanitizeChatText,
  validateMove,
  NPC_TICK_MS,
  advanceTownNpcSimulation,
  type NpcSnapshot,
  type WorldScene,
} from '@pet-village/multiplayer-protocol';
import { internal } from './_generated/api';
import { internalMutation, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { sanitizeEquippedAccessories } from './lib/admissionProfile';

const EMOTE_MIN_INTERVAL_MS = 250;
const PRESENCE_GRACE_MS = 20_000;
const PENGUIN_COLORS = new Set([
  'blue', 'green', 'pink', 'black', 'red', 'purple',
  'orange', 'darkpurple', 'brown', 'peach', 'darkgreen', 'lightblue',
]);

const poseValidator = v.object({
  x: v.number(),
  y: v.number(),
  petX: v.number(),
  petY: v.number(),
  facing: v.string(),
  moving: v.boolean(),
});

function accessoryFields(equipped: ReturnType<typeof sanitizeEquippedAccessories>) {
  return {
    accessoryHeadLeft: equipped.headLeft ?? '',
    accessoryHeadRight: equipped.headRight ?? '',
    accessoryBody: equipped.body ?? '',
    accessoryExtra: equipped.extra ?? '',
  };
}

async function requireUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function loadProfile(ctx: QueryCtx | MutationCtx, userId: Id<'users'>, penguinColor: string) {
  const [save, canonical] = await Promise.all([
    ctx.db.query('saves').withIndex('by_user', (q) => q.eq('userId', userId)).unique(),
    ctx.db.query('multiplayerNames').withIndex('by_user', (q) => q.eq('userId', userId)).unique(),
  ]);
  if (!save?.adopted || !canonical) {
    throw new Error('Canonical adopted profile required before joining multiplayer');
  }
  const color = PENGUIN_COLORS.has(penguinColor)
    ? penguinColor
    : (save.penguinColor && PENGUIN_COLORS.has(save.penguinColor) ? save.penguinColor : 'blue');
  return {
    displayName: canonical.displayName,
    petName: canonical.petName,
    petSpecies: save.petSpecies ?? 'mametchi',
    penguinColor: color,
    equippedAccessories: sanitizeEquippedAccessories(save.equippedAccessories),
    townPosition: save.townPosition,
  };
}

async function presenceBySession(ctx: QueryCtx | MutationCtx, sessionId: string) {
  return ctx.db.query('presence').withIndex('by_session', (q) => q.eq('sessionId', sessionId)).unique();
}

async function requireSession(ctx: MutationCtx, userId: Id<'users'>, sessionId: string) {
  const row = await presenceBySession(ctx, sessionId);
  if (!row || row.userId !== userId) throw new Error('Unknown multiplayer session');
  return row;
}

function correction(row: { scene: string; x: number; y: number; petX: number; petY: number }, recoverScene = false) {
  return {
    scene: row.scene as WorldScene,
    x: row.x,
    y: row.y,
    petX: row.petX,
    petY: row.petY,
    recoverScene,
  };
}

async function townSimRow(ctx: QueryCtx | MutationCtx) {
  return ctx.db.query('townSim').withIndex('by_key', (q) => q.eq('key', 'town')).unique();
}

async function setOccupantCount(ctx: MutationCtx, count: number) {
  const next = Math.max(0, count);
  const sim = await townSimRow(ctx);
  if (sim) {
    if (sim.occupantCount !== next) await ctx.db.patch(sim._id, { occupantCount: next });
    return;
  }
  await ctx.db.insert('townSim', {
    key: 'town',
    lastStepAt: Date.now(),
    tickScheduled: false,
    occupantCount: next,
  });
}

async function bumpOccupancy(ctx: MutationCtx, delta: number) {
  const sim = await townSimRow(ctx);
  await setOccupantCount(ctx, (sim?.occupantCount ?? 0) + delta);
}

async function ensureNpcTick(ctx: MutationCtx) {
  const sim = await townSimRow(ctx);
  if (sim?.tickScheduled) return;
  if (sim) {
    await ctx.db.patch(sim._id, { tickScheduled: true });
  } else {
    await ctx.db.insert('townSim', {
      key: 'town',
      lastStepAt: Date.now(),
      tickScheduled: true,
      occupantCount: 0,
    });
  }
  await ctx.scheduler.runAfter(NPC_TICK_MS, internal.world.tickNpcs, {});
}

export const join = mutation({
  args: { penguinColor: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const profile = await loadProfile(ctx, userId, args.penguinColor);
    const sessionId = crypto.randomUUID();
    const spawn = profile.townPosition ?? { ...TOWN_SPAWNS[0], facing: 'down' as const };
    const now = Date.now();
    await bumpOccupancy(ctx, 1);
    await ctx.db.insert('presence', {
      userId,
      sessionId,
      displayName: profile.displayName,
      petName: profile.petName,
      petSpecies: profile.petSpecies,
      penguinColor: profile.penguinColor,
      ...accessoryFields(profile.equippedAccessories),
      x: spawn.x,
      y: spawn.y,
      petX: spawn.x - 30,
      petY: spawn.y + 10,
      facing: spawn.facing,
      moving: false,
      active: false,
      seq: 0,
      scene: 'town',
      activity: '',
      waveId: '',
      waveTarget: '',
      chatId: '',
      chatText: '',
      emote: '',
      petEmote: '',
      petEmoteId: '',
      lastChatAt: 0,
      lastWaveAt: 0,
      lastEmoteAt: 0,
      lastProfileRefreshAt: 0,
      restoring: false,
      updatedAt: now,
    });
    await ensureNpcTick(ctx);
    await ctx.scheduler.runAfter(PRESENCE_GRACE_MS, internal.world.expireStale, {});
    return { sessionId, userId: String(userId), protocolVersion: PROTOCOL_VERSION };
  },
});

export const leave = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const row = await presenceBySession(ctx, args.sessionId);
    if (row && row.userId === userId) {
      await ctx.db.delete(row._id);
      await bumpOccupancy(ctx, -1);
    }
  },
});

export const move = mutation({
  args: {
    sessionId: v.string(),
    scene: v.string(),
    x: v.number(),
    y: v.number(),
    petX: v.number(),
    petY: v.number(),
    facing: v.string(),
    moving: v.boolean(),
    seq: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const player = await requireSession(ctx, userId, args.sessionId);
    if (!player.active || player.activity) {
      await ctx.db.patch(player._id, { moving: false });
      return { correction: correction(player) };
    }
    const now = Date.now();
    const result = validateMove(
      {
        scene: isWorldScene(player.scene) ? player.scene : 'town',
        x: player.x,
        y: player.y,
        lastSeq: player.seq,
        lastMoveAt: player.updatedAt,
        lastWaveAt: 0,
      },
      {
        scene: args.scene,
        x: args.x,
        y: args.y,
        petX: args.petX,
        petY: args.petY,
        facing: args.facing,
        moving: args.moving,
        seq: args.seq,
      },
      now,
      player.reentryScene && isWorldScene(player.reentryScene) ? player.reentryScene : false,
    );
    if (!result.ok) return { correction: correction(player) };
    await ctx.db.patch(player._id, {
      ...result.move,
      updatedAt: now,
      reentryScene: undefined,
      emote: result.move.moving ? '' : player.emote,
    });
    return {};
  },
});

export const setActive = mutation({
  args: {
    sessionId: v.string(),
    active: v.boolean(),
    scene: v.optional(v.string()),
    pose: v.optional(poseValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const player = await requireSession(ctx, userId, args.sessionId);
    const scene = args.scene && isWorldScene(args.scene) ? args.scene : 'town';
    const pose = args.pose;
    if (pose && !(
      [pose.x, pose.y, pose.petX, pose.petY].every(Number.isFinite) &&
      isFacing(pose.facing) &&
      Math.hypot(pose.petX - pose.x, pose.petY - pose.y) <= 160
    )) return {};

    const restoring = player.restoring;
    const changingScene = args.active && scene !== player.scene;
    if (changingScene && (
      !canTransitionWorldScene(player.scene as WorldScene, scene) ||
      (pose && !isApprovedWorldSpawn(scene, pose.x, pose.y))
    )) {
      return { correction: correction(player, true) };
    }
    const restoringSameScene = restoring && !changingScene;
    const entering = args.active && (!player.active || changingScene);
    const patch: Record<string, unknown> = {
      restoring: false,
      active: args.active,
      updatedAt: Date.now(),
      moving: args.active ? player.moving : false,
    };
    if (entering && player.seq > 0 && !restoringSameScene) patch.reentryScene = scene;
    else if (restoringSameScene) patch.reentryScene = undefined;
    if (changingScene) {
      const defaultSpawn = WORLD_SCENE_SPAWNS[scene][0];
      const spawn = pose ?? {
        x: defaultSpawn.x,
        y: defaultSpawn.y,
        petX: defaultSpawn.x - 30,
        petY: defaultSpawn.y + 10,
        facing: 'down' as const,
        moving: false,
      };
      Object.assign(patch, { scene, ...spawn });
    }
    if (args.active) patch.activity = '';
    if (!args.active) {
      patch.emote = '';
      patch.petEmote = '';
      patch.petEmoteId = '';
    }
    await ctx.db.patch(player._id, patch);
    return {};
  },
});

export const setActivity = mutation({
  args: { sessionId: v.string(), activity: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const player = await requireSession(ctx, userId, args.sessionId);
    if (args.activity !== '' && !isGameActivity(args.activity)) return;
    const patch: Record<string, unknown> = { activity: args.activity, updatedAt: Date.now() };
    if (args.activity) {
      patch.active = false;
      patch.moving = false;
      patch.emote = '';
      patch.petEmote = '';
      patch.petEmoteId = '';
    }
    await ctx.db.patch(player._id, patch);
  },
});

export const refreshProfile = mutation({
  args: { sessionId: v.string(), penguinColor: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const player = await requireSession(ctx, userId, args.sessionId);
    const now = Date.now();
    const elapsed = now - player.lastProfileRefreshAt;
    if (elapsed < 200) return { ok: false, retryAfterMs: 200 - elapsed };
    const profile = await loadProfile(ctx, userId, args.penguinColor);
    await ctx.db.patch(player._id, {
      displayName: profile.displayName,
      petName: profile.petName,
      petSpecies: profile.petSpecies,
      penguinColor: profile.penguinColor,
      ...accessoryFields(profile.equippedAccessories),
      lastProfileRefreshAt: now,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const wave = mutation({
  args: { sessionId: v.string(), targetSessionId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const player = await requireSession(ctx, userId, args.sessionId);
    const target = await presenceBySession(ctx, args.targetSessionId);
    const now = Date.now();
    if (
      !target ||
      player.scene !== target.scene ||
      !player.active ||
      !target.active ||
      !canWave({ x: player.x, y: player.y, lastWaveAt: player.lastWaveAt }, target, now)
    ) return;
    await ctx.db.patch(player._id, {
      emote: 'wave',
      moving: false,
      lastEmoteAt: now,
      lastWaveAt: now,
      waveId: `${now}:${crypto.randomUUID()}`,
      waveTarget: args.targetSessionId,
      updatedAt: now,
    });
  },
});

export const emote = mutation({
  args: { sessionId: v.string(), emote: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const player = await requireSession(ctx, userId, args.sessionId);
    if (!player.active || player.activity) return;
    if (args.emote !== '' && !isPenguinEmote(args.emote)) return;
    if (args.emote === player.emote) return;
    const now = Date.now();
    if (now - player.lastEmoteAt < EMOTE_MIN_INTERVAL_MS) return;
    await ctx.db.patch(player._id, {
      emote: args.emote,
      moving: args.emote ? false : player.moving,
      lastEmoteAt: now,
      updatedAt: now,
    });
  },
});

export const petEmote = mutation({
  args: { sessionId: v.string(), expression: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const player = await requireSession(ctx, userId, args.sessionId);
    if (!player.active || player.activity) return;
    if (args.expression !== '' && !isPetExpression(args.expression)) return;
    const now = Date.now();
    if (now - player.lastEmoteAt < EMOTE_MIN_INTERVAL_MS) return;
    await ctx.db.patch(player._id, {
      petEmote: args.expression,
      petEmoteId: args.expression ? `${now}:${crypto.randomUUID()}` : '',
      lastEmoteAt: now,
      updatedAt: now,
    });
  },
});

export const chat = mutation({
  args: { sessionId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const player = await requireSession(ctx, userId, args.sessionId);
    if (!player.active) return;
    const text = sanitizeChatText(args.text);
    const now = Date.now();
    if (!text || !canChat({ lastChatAt: player.lastChatAt }, now)) return;
    await ctx.db.patch(player._id, {
      chatText: text,
      chatId: `${now}:${crypto.randomUUID()}`,
      lastChatAt: now,
      updatedAt: now,
    });
  },
});

export const markRestoring = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const player = await requireSession(ctx, userId, args.sessionId);
    await ctx.db.patch(player._id, { restoring: true, updatedAt: Date.now() });
  },
});

export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const now = Date.now();
    const rows = await ctx.db.query('presence').collect();
    const live = rows.filter((row) => now - row.updatedAt <= PRESENCE_GRACE_MS);
    const npcs = await ctx.db.query('townNpcs').collect();
    return {
      userId: String(userId),
      protocolVersion: PROTOCOL_VERSION,
      players: live.map((row) => ({
        sessionId: row.sessionId,
        userId: String(row.userId),
        displayName: row.displayName,
        petName: row.petName,
        petSpecies: row.petSpecies,
        penguinColor: row.penguinColor,
        accessoryHeadLeft: row.accessoryHeadLeft,
        accessoryHeadRight: row.accessoryHeadRight,
        accessoryBody: row.accessoryBody,
        accessoryExtra: row.accessoryExtra,
        x: row.x,
        y: row.y,
        petX: row.petX,
        petY: row.petY,
        facing: row.facing,
        moving: row.moving,
        active: row.active,
        seq: row.seq,
        scene: row.scene,
        activity: row.activity,
        waveId: row.waveId,
        waveTarget: row.waveTarget,
        chatId: row.chatId,
        chatText: row.chatText,
        emote: row.emote,
        petEmote: row.petEmote,
        petEmoteId: row.petEmoteId,
        updatedAt: row.updatedAt,
      })),
      npcs: npcs.map((npc) => ({
        id: npc.npcId,
        x: npc.x,
        y: npc.y,
        facing: npc.facing,
        moving: npc.moving,
        updatedAt: npc.updatedAt,
        destination: npc.destination,
        pauseUntil: npc.pauseUntil,
      })),
    };
  },
});

export const expireStale = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - PRESENCE_GRACE_MS;
    const rows = await ctx.db.query('presence').collect();
    for (const row of rows) {
      if (row.updatedAt < cutoff) await ctx.db.delete(row._id);
    }
    const live = (await ctx.db.query('presence').collect()).filter((row) => now - row.updatedAt <= PRESENCE_GRACE_MS);
    await setOccupantCount(ctx, live.length);
    if (live.length > 0) {
      const sim = await townSimRow(ctx);
      // A dead scheduler leaves tickScheduled true and villagers frozen.
      if (sim && now - sim.lastStepAt > NPC_TICK_MS * 5) {
        await ctx.db.patch(sim._id, { tickScheduled: false });
      }
      await ensureNpcTick(ctx);
    }
  },
});

function npcDocChanged(
  doc: { destination: number; pauseUntil: number },
  next: NpcSnapshot,
) {
  return doc.destination !== next.destination || doc.pauseUntil !== next.pauseUntil;
}

export const tickNpcs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const simRow = await townSimRow(ctx);
    // Occupancy lives on townSim so this tick does not read `presence`.
    // Reading every player here retried against every walk mutation and
    // killed the scheduler chain, which froze the plaza.
    const occupied = simRow?.occupantCount === undefined || (simRow.occupantCount ?? 0) > 0;
    if (!occupied) {
      if (simRow) await ctx.db.patch(simRow._id, { tickScheduled: false });
      return;
    }

    const docs = await ctx.db.query('townNpcs').collect();
    const states = new Map<string, NpcSnapshot>();
    for (const doc of docs) {
      states.set(doc.npcId, {
        id: doc.npcId,
        x: doc.x,
        y: doc.y,
        facing: doc.facing,
        moving: doc.moving,
        updatedAt: doc.updatedAt,
        destination: doc.destination,
        pauseUntil: doc.pauseUntil,
      });
    }
    const lastStepAt = simRow?.lastStepAt ?? now;
    const t = advanceTownNpcSimulation(states, lastStepAt, now);
    for (const doc of docs) {
      const next = states.get(doc.npcId);
      if (!next) {
        await ctx.db.delete(doc._id);
        continue;
      }
      if (!npcDocChanged(doc, next)) continue;
      await ctx.db.patch(doc._id, {
        x: next.x,
        y: next.y,
        facing: next.facing,
        moving: next.moving,
        updatedAt: next.updatedAt,
        destination: next.destination,
        pauseUntil: next.pauseUntil,
      });
    }
    for (const [id, next] of states) {
      if (docs.some((doc) => doc.npcId === id)) continue;
      await ctx.db.insert('townNpcs', {
        npcId: id,
        x: next.x,
        y: next.y,
        facing: next.facing,
        moving: next.moving,
        updatedAt: next.updatedAt,
        destination: next.destination,
        pauseUntil: next.pauseUntil,
      });
    }
    if (simRow) {
      if (simRow.lastStepAt !== t || !simRow.tickScheduled) {
        await ctx.db.patch(simRow._id, { lastStepAt: t, tickScheduled: true });
      }
    } else {
      await ctx.db.insert('townSim', { key: 'town', lastStepAt: t, tickScheduled: true, occupantCount: 1 });
    }
    await ctx.scheduler.runAfter(NPC_TICK_MS, internal.world.tickNpcs, {});
  },
});
