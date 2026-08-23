import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import {
  SLED_MAX_PLAYERS,
  SLED_TICK_MS,
  SledPlayerState,
  SledRunState,
  dumpSledSimulation,
  isSledDifficulty,
  loadSledSimulation,
  type SledCourseItem,
  type SledDifficulty,
  type SledEffect,
  type SledPhase,
  type SledSimSnapshot,
} from '@pet-village/multiplayer-protocol';
import { internal } from './_generated/api';
import { internalMutation, mutation, query, type MutationCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';

const RACE_KEY = 'default' as const;
const PENGUIN_COLORS = new Set([
  'blue', 'green', 'pink', 'black', 'red', 'purple',
  'orange', 'darkpurple', 'brown', 'peach', 'darkgreen', 'lightblue',
]);

async function requireUser(ctx: MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error('Not authenticated');
  return userId;
}

async function loadRace(ctx: MutationCtx) {
  const race = await ctx.db.query('sledRace').withIndex('by_key', (q) => q.eq('key', RACE_KEY)).unique();
  const racers = await ctx.db.query('sledRacers').collect();
  const state = new SledRunState();
  if (race) {
    state.phase = race.phase as SledPhase;
    state.leader = race.leader;
    state.difficulty = race.difficulty as SledDifficulty;
    state.seed = race.seed;
    state.countdownAt = race.countdownAt;
    state.startedAt = race.startedAt;
    state.serverTime = race.serverTime;
    state.round = race.round;
  }
  for (const racer of racers) {
    const row = new SledPlayerState();
    Object.assign(row, {
      userId: String(racer.userId),
      displayName: racer.displayName,
      penguinColor: racer.penguinColor,
      x: racer.x,
      progress: racer.progress,
      speed: racer.speed,
      steering: racer.steering,
      inputSeq: racer.inputSeq,
      effect: racer.effect as SledEffect,
      effectUntil: racer.effectUntil,
      finishedAt: racer.finishedAt,
      rank: racer.rank,
    });
    state.racers.set(racer.sessionId, row);
  }
  const snapshot: SledSimSnapshot | undefined = race
    ? {
        course: race.course as SledCourseItem[],
        finishCount: race.finishCount,
        hitItems: race.hitItems,
        lastInputAt: race.lastInputAt,
        lanes: race.lanes,
        effectSource: race.effectSource,
        sweptIndex: race.sweptIndex,
        rejectedClaims: race.rejectedClaims,
      }
    : undefined;
  return { race, racers, state, sim: loadSledSimulation(state, snapshot) };
}

async function saveRace(
  ctx: MutationCtx,
  previous: { race: Doc<'sledRace'> | null; racers: Doc<'sledRacers'>[] },
  state: SledRunState,
  sim: ReturnType<typeof loadSledSimulation>,
  tickScheduled: boolean,
) {
  const dump = dumpSledSimulation(sim);
  const fields = {
    key: RACE_KEY,
    phase: state.phase,
    leader: state.leader,
    difficulty: state.difficulty,
    seed: state.seed,
    countdownAt: state.countdownAt,
    startedAt: state.startedAt,
    serverTime: state.serverTime,
    round: state.round,
    course: dump.course,
    finishCount: dump.finishCount,
    hitItems: dump.hitItems,
    lastInputAt: dump.lastInputAt,
    lanes: dump.lanes,
    effectSource: dump.effectSource,
    sweptIndex: dump.sweptIndex,
    rejectedClaims: dump.rejectedClaims,
    tickScheduled,
  };
  if (previous.race) await ctx.db.patch(previous.race._id, fields);
  else await ctx.db.insert('sledRace', fields);

  const keep = new Set(state.racers.keys());
  for (const row of previous.racers) {
    const next = state.racers.get(row.sessionId);
    if (!next) {
      await ctx.db.delete(row._id);
      continue;
    }
    await ctx.db.patch(row._id, {
      displayName: next.displayName,
      penguinColor: next.penguinColor,
      x: next.x,
      progress: next.progress,
      speed: next.speed,
      steering: next.steering,
      inputSeq: next.inputSeq,
      effect: next.effect,
      effectUntil: next.effectUntil,
      finishedAt: next.finishedAt,
      rank: next.rank,
    });
  }
  for (const [sessionId, next] of state.racers) {
    if (previous.racers.some((row) => row.sessionId === sessionId)) continue;
    await ctx.db.insert('sledRacers', {
      sessionId,
      userId: next.userId as Id<'users'>,
      displayName: next.displayName,
      penguinColor: next.penguinColor,
      x: next.x,
      progress: next.progress,
      speed: next.speed,
      steering: next.steering,
      inputSeq: next.inputSeq,
      effect: next.effect,
      effectUntil: next.effectUntil,
      finishedAt: next.finishedAt,
      rank: next.rank,
    });
  }
  void keep;
}

async function ensureTick(ctx: MutationCtx, race: Doc<'sledRace'> | null, phase: string) {
  if (phase !== 'countdown' && phase !== 'racing') return;
  if (race?.tickScheduled) return;
  if (race) await ctx.db.patch(race._id, { tickScheduled: true });
  await ctx.scheduler.runAfter(SLED_TICK_MS, internal.sled.tick, {});
}

export const join = mutation({
  args: { penguinColor: v.string(), displayName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const loaded = await loadRace(ctx);
    if (loaded.state.phase !== 'lobby' && loaded.state.phase !== 'finished') {
      throw new Error('Room already started');
    }
    if ([...loaded.state.racers.values()].some((racer) => racer.userId === String(userId))) {
      throw new Error('User is already in this Sled Run');
    }
    if (loaded.state.racers.size >= SLED_MAX_PLAYERS) throw new Error('Sled Run lobby is full');
    const sessionId = crypto.randomUUID();
    const color = PENGUIN_COLORS.has(args.penguinColor) ? args.penguinColor : 'blue';
    if (!loaded.sim.join(sessionId, {
      userId: String(userId),
      displayName: args.displayName || 'Player',
      penguinColor: color,
    })) {
      throw new Error('Room already started');
    }
    loaded.state.racers.get(sessionId)!.steering = 0;
    await saveRace(ctx, loaded, loaded.state, loaded.sim, loaded.race?.tickScheduled ?? false);
    return { sessionId };
  },
});

export const leave = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const loaded = await loadRace(ctx);
    loaded.sim.leave(args.sessionId);
    await saveRace(ctx, loaded, loaded.state, loaded.sim, false);
  },
});

export const setDifficulty = mutation({
  args: { sessionId: v.string(), difficulty: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    if (!isSledDifficulty(args.difficulty)) return;
    const loaded = await loadRace(ctx);
    loaded.sim.setDifficulty(args.sessionId, args.difficulty);
    await saveRace(ctx, loaded, loaded.state, loaded.sim, loaded.race?.tickScheduled ?? false);
  },
});

export const start = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const loaded = await loadRace(ctx);
    if (!loaded.sim.start(args.sessionId)) return;
    await saveRace(ctx, loaded, loaded.state, loaded.sim, true);
    await ctx.scheduler.runAfter(SLED_TICK_MS, internal.sled.tick, {});
  },
});

export const input = mutation({
  args: { sessionId: v.string(), steering: v.number(), seq: v.number() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const loaded = await loadRace(ctx);
    loaded.sim.input(args.sessionId, { steering: args.steering as -1 | 0 | 1, seq: args.seq });
    await saveRace(ctx, loaded, loaded.state, loaded.sim, loaded.race?.tickScheduled ?? false);
  },
});

export const hit = mutation({
  args: { sessionId: v.string(), itemId: v.string() },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const loaded = await loadRace(ctx);
    loaded.sim.hit(args.sessionId, { itemId: args.itemId });
    const rejected = loaded.sim.takeRejectedClaims();
    await saveRace(ctx, loaded, loaded.state, loaded.sim, loaded.race?.tickScheduled ?? false);
    return { rejected: rejected.filter((claim) => claim.sessionId === args.sessionId).map((claim) => claim.itemId) };
  },
});

export const snapshot = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const race = await ctx.db.query('sledRace').withIndex('by_key', (q) => q.eq('key', RACE_KEY)).unique();
    const racers = await ctx.db.query('sledRacers').collect();
    if (!race) {
      return {
        phase: 'lobby' as SledPhase,
        leader: '',
        difficulty: 'easy' as SledDifficulty,
        seed: '',
        countdownAt: 0,
        startedAt: 0,
        serverTime: Date.now(),
        round: 0,
        racers: [],
      };
    }
    return {
      phase: race.phase as SledPhase,
      leader: race.leader,
      difficulty: race.difficulty as SledDifficulty,
      seed: race.seed,
      countdownAt: race.countdownAt,
      startedAt: race.startedAt,
      serverTime: race.serverTime,
      round: race.round,
      racers: racers.map((racer) => ({
        sessionId: racer.sessionId,
        userId: String(racer.userId),
        displayName: racer.displayName,
        penguinColor: racer.penguinColor,
        x: racer.x,
        progress: racer.progress,
        speed: racer.speed,
        steering: racer.steering,
        inputSeq: racer.inputSeq,
        effect: racer.effect as SledEffect,
        effectUntil: racer.effectUntil,
        rank: racer.rank,
        finishedAt: racer.finishedAt,
      })),
    };
  },
});

export const tick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const loaded = await loadRace(ctx);
    if (loaded.state.phase !== 'countdown' && loaded.state.phase !== 'racing') {
      if (loaded.race) await ctx.db.patch(loaded.race._id, { tickScheduled: false });
      return;
    }
    const now = Date.now();
    const last = loaded.state.serverTime || now;
    loaded.sim.step(Math.min(now - last, 100), now);
    const keepTicking = loaded.state.phase === 'countdown' || loaded.state.phase === 'racing';
    await saveRace(ctx, loaded, loaded.state, loaded.sim, keepTicking);
    if (keepTicking) await ctx.scheduler.runAfter(SLED_TICK_MS, internal.sled.tick, {});
  },
});
