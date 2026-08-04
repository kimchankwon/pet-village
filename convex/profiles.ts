import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation } from './_generated/server';
import {
  assertProfileNamesAvailable,
  profileNameKey,
  validateProfileNames,
} from './lib/profileNames';

export const updateMine = mutation({
  args: { displayName: v.string(), petName: v.string() },
  returns: v.object({ displayName: v.string(), petName: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('Not authenticated');
    const names = validateProfileNames(args.displayName, args.petName);
    const display = { name: names.displayName, key: profileNameKey(names.displayName) };
    const pet = { name: names.petName, key: profileNameKey(names.petName) };

    const [displayHolders, petHolders, existing, save] = await Promise.all([
      ctx.db
        .query('multiplayerNames')
        .withIndex('by_display_name', (q) => q.eq('displayNameKey', display.key))
        .collect(),
      ctx.db
        .query('multiplayerNames')
        .withIndex('by_pet_name', (q) => q.eq('petNameKey', pet.key))
        .collect(),
      ctx.db.query('multiplayerNames').withIndex('by_user', (q) => q.eq('userId', userId)).unique(),
      ctx.db.query('saves').withIndex('by_user', (q) => q.eq('userId', userId)).unique(),
    ]);

    // Prefer the oldest row when a past race left duplicate keys.
    const oldest = (rows: typeof displayHolders) =>
      rows.length === 0
        ? undefined
        : [...rows].sort((a, b) => a._creationTime - b._creationTime)[0]!.userId;

    assertProfileNamesAvailable(userId, oldest(displayHolders), oldest(petHolders));
    if (!save?.adopted) throw new Error('Adopt a pet before changing names');

    await Promise.all([
      ctx.db.patch(userId, { name: display.name }),
      ctx.db.patch(save._id, { petName: pet.name, updatedAt: Date.now() }),
      existing
        ? ctx.db.patch(existing._id, {
            displayName: display.name,
            displayNameKey: display.key,
            petName: pet.name,
            petNameKey: pet.key,
            legacyPetNameKey: undefined,
            updatedAt: Date.now(),
          })
        : ctx.db.insert('multiplayerNames', {
            userId,
            displayName: display.name,
            displayNameKey: display.key,
            petName: pet.name,
            petNameKey: pet.key,
            updatedAt: Date.now(),
          }),
    ]);

    return { displayName: display.name, petName: pet.name };
  },
});
