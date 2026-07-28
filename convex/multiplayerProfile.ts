import { getAuthUserId } from '@convex-dev/auth/server';
import { internalQuery } from './_generated/server';

export const admissionProfile = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const [save, canonical] = await Promise.all([
      ctx.db.query('saves').withIndex('by_user', (q) => q.eq('userId', userId)).unique(),
      ctx.db.query('multiplayerNames').withIndex('by_user', (q) => q.eq('userId', userId)).unique(),
    ]);
    if (!save?.adopted || !canonical) {
      throw new Error('Canonical adopted profile required before joining multiplayer');
    }
    return {
      identity: String(userId),
      displayName: canonical.displayName,
      petName: canonical.petName,
      petSpecies: save.petSpecies ?? 'mametchi',
      penguinColor: save.penguinColor ?? 'blue',
      equippedAccessories: save.equippedAccessories ?? {},
      townPosition: save.townPosition,
    };
  },
});
