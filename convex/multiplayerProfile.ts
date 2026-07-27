import { getAuthUserId } from '@convex-dev/auth/server';
import { internalQuery } from './_generated/server';

export const admissionProfile = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const [user, save] = await Promise.all([
      ctx.db.get(userId),
      ctx.db.query('saves').withIndex('by_user', (q) => q.eq('userId', userId)).unique(),
    ]);
    if (!save) throw new Error('Save required before joining multiplayer');
    return {
      identity: String(userId),
      displayName: (user?.name?.trim() || 'Player').slice(0, 32),
      petName: save.petName.slice(0, 32),
      petSpecies: save.petSpecies ?? 'mametchi',
      penguinColor: save.penguinColor ?? 'blue',
    };
  },
});
