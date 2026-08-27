/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { NPC_TICK_MS } from '@pet-village/multiplayer-protocol';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

describe('town NPC ticks', () => {
  test('an occupied plaza seeds villagers and advances them', async () => {
    const t = convexTest(schema, modules);
    const startedAt = Date.now() - NPC_TICK_MS * 4;
    await t.run(async (ctx) => {
      await ctx.db.insert('townSim', {
        key: 'town',
        lastStepAt: startedAt,
        tickScheduled: true,
        occupantCount: 1,
      });
    });

    await t.mutation(internal.world.tickNpcs, {});

    const npcs = await t.run((ctx) => ctx.db.query('townNpcs').collect());
    expect(npcs.length).toBeGreaterThan(1);
    expect(npcs.some((npc) => npc.npcId === 'bongbongee')).toBe(true);
    const bong = npcs.find((npc) => npc.npcId === 'bongbongee')!;
    expect(bong.x).not.toBe(0);
    expect(bong.updatedAt).toBeGreaterThan(startedAt);
  });

  test('an empty plaza does not keep ticking', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('townSim', {
        key: 'town',
        lastStepAt: Date.now(),
        tickScheduled: true,
        occupantCount: 0,
      });
    });

    await t.mutation(internal.world.tickNpcs, {});

    const [sim, npcs] = await t.run(async (ctx) => [
      await ctx.db.query('townSim').withIndex('by_key', (q) => q.eq('key', 'town')).unique(),
      await ctx.db.query('townNpcs').collect(),
    ]);
    expect(sim?.tickScheduled).toBe(false);
    expect(npcs).toEqual([]);
  });

  test('expireStale restarts a stuck tick chain when someone is still in town', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Alice' }));
    await t.run(async (ctx) => {
      await ctx.db.insert('presence', {
        userId,
        sessionId: 'live-session',
        displayName: 'Alice',
        petName: 'Mochi',
        petSpecies: 'mametchi',
        penguinColor: 'blue',
        accessoryHeadLeft: '',
        accessoryHeadRight: '',
        accessoryBody: '',
        accessoryExtra: '',
        x: 100,
        y: 100,
        petX: 70,
        petY: 110,
        facing: 'down',
        moving: false,
        active: true,
        seq: 1,
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
        updatedAt: Date.now(),
      });
      await ctx.db.insert('townSim', {
        key: 'town',
        lastStepAt: Date.now() - 10_000,
        tickScheduled: true,
        occupantCount: 0,
      });
    });

    await t.mutation(internal.world.expireStale, {});

    const sim = await t.run((ctx) =>
      ctx.db.query('townSim').withIndex('by_key', (q) => q.eq('key', 'town')).unique(),
    );
    expect(sim?.occupantCount).toBe(1);
    expect(sim?.tickScheduled).toBe(true);
  });
});
