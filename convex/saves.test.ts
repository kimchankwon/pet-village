/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';
import { upsertCanonicalSave } from './saves';

const modules = import.meta.glob('./**/!(*.*.*)*.*s');

function save(petName: string, petSpecies: 'mametchi' | 'kuchipatchi' = 'mametchi') {
  return {
    version: 1,
    coins: 100,
    petName,
    petSpecies,
    adopted: true,
    pet: { hunger: 100, happiness: 100, energy: 100 },
    lastSeen: 1,
    inventory: {},
    placed: [],
    bestPaperToss: 0,
    biggestCatch: 0,
    bestSkipRope: 0,
    ownedAccessories: [],
    equippedAccessories: { headLeft: '', headRight: '', body: '', extra: '' },
    penguinColor: 'blue',
  } as const;
}

describe('canonical cloud saves', () => {
  test('first adoption atomically reserves the normalized pet name', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Alice' }));

    await t.mutation((ctx) => upsertCanonicalSave(ctx, userId, save('  Mochi  ')));

    const docs = await t.run(async (ctx) => ({
      save: await ctx.db.query('saves').withIndex('by_user', (q) => q.eq('userId', userId)).unique(),
      names: await ctx.db.query('multiplayerNames').withIndex('by_user', (q) => q.eq('userId', userId)).unique(),
    }));
    expect(docs.save?.petName).toBe('Mochi');
    expect(docs.names).toMatchObject({ petName: 'Mochi', petNameKey: 'mochi' });
  });

  test('adoption stores the canonical display name on the account', async () => {
    const t = convexTest(schema, modules);
    // Password sign-ups arrive with no provider name at all.
    const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'nameless@example.com' }));

    await t.mutation((ctx) => upsertCanonicalSave(ctx, userId, save('Mochi')));

    const docs = await t.run(async (ctx) => ({
      user: await ctx.db.get(userId),
      names: await ctx.db
        .query('multiplayerNames').withIndex('by_user', (q) => q.eq('userId', userId)).unique(),
    }));
    expect(docs.names?.displayName).toBe('Player');
    expect(docs.user?.name).toBe(docs.names?.displayName);
  });

  test('generated display-name suffixes do not retain trailing whitespace', async () => {
    const t = convexTest(schema, modules);
    const base = '12345678901234567 AB';
    const [firstUser, secondUser] = await t.run(async (ctx) => [
      await ctx.db.insert('users', { name: base }),
      await ctx.db.insert('users', { name: base }),
    ] as const);
    await t.mutation((ctx) => upsertCanonicalSave(ctx, firstUser, save('Mochi')));
    await t.mutation((ctx) => upsertCanonicalSave(ctx, secondUser, save('Mame')));

    const names = await t.run((ctx) => ctx.db
      .query('multiplayerNames').withIndex('by_user', (q) => q.eq('userId', secondUser)).unique());
    expect(names?.displayName).toBe('12345678901234567-2');
  });

  test('a duplicate adoption rejects without writing a save', async () => {
    const t = convexTest(schema, modules);
    const [firstUser, secondUser] = await t.run(async (ctx) => [
      await ctx.db.insert('users', { name: 'Alice' }),
      await ctx.db.insert('users', { name: 'Bob' }),
    ] as const);
    await t.mutation((ctx) => upsertCanonicalSave(ctx, firstUser, save('Mochi')));
    // The cloud saver may create an unadopted row before the adoption flow.
    // That is not a legacy adopted profile and must not receive a silent suffix.
    await t.run((ctx) => ctx.db.insert('saves', {
      ...save('Starter'),
      adopted: false,
      equippedAccessories: {},
      userId: secondUser,
      updatedAt: 1,
    } as any));

    await expect(
      t.mutation((ctx) => upsertCanonicalSave(ctx, secondUser, save('ｍＯＣＨＩ'))),
    ).rejects.toThrow('pet name is already taken');
    const secondSave = await t.run((ctx) =>
      ctx.db.query('saves').withIndex('by_user', (q) => q.eq('userId', secondUser)).unique(),
    );
    expect(secondSave).toMatchObject({ petName: 'Starter', adopted: false });
  });

  test('changing pets updates the canonical reservation and save together', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Alice' }));
    await t.mutation((ctx) => upsertCanonicalSave(ctx, userId, save('Mochi')));

    await t.mutation((ctx) => upsertCanonicalSave(
      ctx,
      userId,
      save('Mame', 'kuchipatchi'),
      { allowPetNameChange: true },
    ));

    const docs = await t.run(async (ctx) => ({
      save: await ctx.db.query('saves').withIndex('by_user', (q) => q.eq('userId', userId)).unique(),
      names: await ctx.db.query('multiplayerNames').withIndex('by_user', (q) => q.eq('userId', userId)).unique(),
    }));
    expect(docs.save).toMatchObject({ petName: 'Mame', petSpecies: 'kuchipatchi' });
    expect(docs.names).toMatchObject({ petName: 'Mame', petNameKey: 'mame' });
  });

  test('grandfathers invalid and duplicate legacy pet names into unique canonical names', async () => {
    const t = convexTest(schema, modules);
    const [firstUser, secondUser] = await t.run(async (ctx) => {
      const first = await ctx.db.insert('users', { name: 'Alice' });
      const second = await ctx.db.insert('users', { name: 'Bob' });
      await ctx.db.insert('saves', { ...save('Mochi!'), equippedAccessories: {}, userId: first, updatedAt: 1 } as any);
      await ctx.db.insert('saves', { ...save('Mochi!'), equippedAccessories: {}, userId: second, updatedAt: 1 } as any);
      return [first, second] as const;
    });

    await t.mutation((ctx) => upsertCanonicalSave(ctx, firstUser, save('Mochi!')));
    await t.mutation((ctx) => upsertCanonicalSave(ctx, secondUser, save('Mochi!')));
    // A canonical save must retain the legacy alias while another open tab may
    // still hold the pre-migration value.
    await t.mutation((ctx) => upsertCanonicalSave(ctx, secondUser, save('Mochi-2')));
    await t.mutation((ctx) => upsertCanonicalSave(ctx, secondUser, save('Mochi!')));

    const docs = await t.run(async (ctx) => ({
      first: await ctx.db.query('multiplayerNames').withIndex('by_user', (q) => q.eq('userId', firstUser)).unique(),
      second: await ctx.db.query('multiplayerNames').withIndex('by_user', (q) => q.eq('userId', secondUser)).unique(),
      secondSave: await ctx.db.query('saves').withIndex('by_user', (q) => q.eq('userId', secondUser)).unique(),
    }));
    expect(docs.first?.petName).toBe('Mochi');
    expect(docs.second?.petName).toBe('Mochi-2');
    expect(docs.secondSave?.petName).toBe('Mochi-2');
  });

  test('legacy provisioning falls back to stable user-derived names after common suffixes are saturated', async () => {
    const t = convexTest(schema, modules);
    const legacyUser = await t.run(async (ctx) => {
      for (let i = 0; i < 100; i += 1) {
        const owner = await ctx.db.insert('users', { name: `Taken ${i}` });
        const petName = i === 0 ? 'Pet' : `Pet-${i + 1}`;
        const displayName = i === 0 ? 'Player' : `Player-${i + 1}`;
        await ctx.db.insert('multiplayerNames', {
          userId: owner,
          displayName,
          displayNameKey: displayName.toLowerCase(),
          petName,
          petNameKey: petName.toLowerCase(),
          updatedAt: 1,
        });
      }
      const userId = await ctx.db.insert('users', {});
      await ctx.db.insert('saves', {
        ...save('Pet'), equippedAccessories: {}, userId, updatedAt: 1,
      } as any);
      return userId;
    });

    const result = await t.mutation((ctx) => upsertCanonicalSave(ctx, legacyUser, save('Pet')));
    const names = await t.run((ctx) => ctx.db
      .query('multiplayerNames').withIndex('by_user', (q) => q.eq('userId', legacyUser)).unique());
    expect(result.petName).toMatch(/^P-[a-z0-9]{13}$/);
    expect(names?.displayName).toMatch(/^Player-[a-z0-9]{13}$/);
  });

  test('profile updates require adoption and clear migrated legacy aliases on rename', async () => {
    const t = convexTest(schema, modules);
    const [unadoptedUser, legacyUser] = await t.run(async (ctx) => {
      const unadopted = await ctx.db.insert('users', { name: 'New Player' });
      const legacy = await ctx.db.insert('users', { name: 'Legacy Player' });
      await ctx.db.insert('saves', {
        ...save('Starter'), adopted: false, equippedAccessories: {}, userId: unadopted, updatedAt: 1,
      } as any);
      await ctx.db.insert('saves', {
        ...save('Mochi!'), equippedAccessories: {}, userId: legacy, updatedAt: 1,
      } as any);
      return [unadopted, legacy] as const;
    });

    await expect(t.withIdentity({ subject: String(unadoptedUser), issuer: 'test' }).mutation(
      api.profiles.updateMine,
      { displayName: 'New Player', petName: 'Starter' },
    )).rejects.toThrow('Adopt a pet before changing names');

    await t.mutation((ctx) => upsertCanonicalSave(ctx, legacyUser, save('Mochi!')));
    await t.withIdentity({ subject: String(legacyUser), issuer: 'test' }).mutation(
      api.profiles.updateMine,
      { displayName: 'Legacy Player', petName: 'Fluffy' },
    );
    const staleSave = await t.mutation((ctx) => upsertCanonicalSave(ctx, legacyUser, save('Mochi!')));
    expect(staleSave.petName).toBe('Fluffy');
    const docs = await t.run(async (ctx) => ({
      names: await ctx.db.query('multiplayerNames').withIndex('by_user', (q) => q.eq('userId', legacyUser)).unique(),
      save: await ctx.db.query('saves').withIndex('by_user', (q) => q.eq('userId', legacyUser)).unique(),
    }));
    expect(docs.names?.legacyPetNameKey).toBeUndefined();
    expect(docs.names?.petName).toBe('Fluffy');
    expect(docs.save?.petName).toBe('Fluffy');
  });

  test('admission reads only the canonical profile provisioned with the save', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Alice' }));
    const asUser = t.withIdentity({ subject: String(userId), issuer: 'test' });

    await expect(asUser.query(internal.multiplayerProfile.admissionProfile)).rejects.toThrow(
      'Canonical adopted profile required',
    );
    await t.mutation((ctx) => upsertCanonicalSave(ctx, userId, save('Mochi')));

    await expect(asUser.query(internal.multiplayerProfile.admissionProfile)).resolves.toMatchObject({
      identity: String(userId),
      displayName: 'Alice',
      petName: 'Mochi',
      petSpecies: 'mametchi',
    });
  });
});
