import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { ObjectType } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  equippedAccessoriesValidator,
  petSpeciesValidator,
} from "./lib/validators";
import {
  profileNameKey,
  validateDisplayName,
  validatePetName,
} from "./lib/profileNames";

const petStats = v.object({
  hunger: v.number(),
  happiness: v.number(),
  energy: v.number(),
});

const placedItem = v.object({
  id: v.string(),
  gx: v.number(),
  gy: v.number(),
});

const TILE = 48;
const TOWN_WORLD_W = 22 * TILE;
const TOWN_WORLD_H = 16 * TILE;

function isSafeTownPosition(x: number, y: number) {
  const leavesForShore = y > TOWN_WORLD_H - 52 && x > 8.5 * TILE && x < 13.5 * TILE;
  const onParkGate = y > 8 * TILE && y < 10 * TILE && (x < 36 || x > TOWN_WORLD_W - 36);
  return x >= 0 && x <= TOWN_WORLD_W && y >= 0 && y <= TOWN_WORLD_H && !leavesForShore && !onParkGate;
}

const townPosition = v.object({
  x: v.number(),
  y: v.number(),
  facing: v.union(
    v.literal("up"),
    v.literal("down"),
    v.literal("side"),
    v.literal("ne"),
    v.literal("nw"),
    v.literal("se"),
    v.literal("sw"),
  ),
});

const saveFields = {
  version: v.number(),
  coins: v.number(),
  petName: v.string(),
  petSpecies: petSpeciesValidator,
  adopted: v.optional(v.boolean()),
  pet: petStats,
  lastSeen: v.number(),
  inventory: v.record(v.string(), v.number()),
  placed: v.array(placedItem),
  bestPaperToss: v.number(),
  biggestCatch: v.optional(v.number()),
  bestSkipRope: v.optional(v.number()),
  expeditionWins: v.optional(v.record(v.string(), v.number())),
  ownedAccessories: v.optional(v.array(v.string())),
  equippedAccessories: equippedAccessoriesValidator,
  penguinColor: v.optional(v.string()),
  townPosition: v.optional(townPosition),
};

type SaveFields = ObjectType<typeof saveFields>;

const saveDoc = v.object({
  _id: v.id("saves"),
  _creationTime: v.number(),
  userId: v.id("users"),
  ...saveFields,
  updatedAt: v.number(),
});

function truncateForSuffix(value: string, maxLength: number) {
  let result = '';
  for (const char of value) {
    if (result.length + char.length > maxLength) break;
    result += char;
  }
  return result;
}

function legacyPetBase(rawName: string) {
  const cleaned = rawName
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N} _'-]+/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+/u, '');
  return truncateForSuffix(cleaned, 16) || 'Pet';
}

function stableUserSuffix(userId: Id<'users'>, salt: number) {
  let hash = 0xcbf29ce484222325n;
  for (const char of `${userId}:${salt}`) {
    hash ^= BigInt(char.codePointAt(0) ?? 0);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(36).padStart(13, '0').slice(-13);
}

/** First holder of a pet-name key, if any (safe when duplicate rows exist). */
async function petNameHolder(ctx: MutationCtx, petNameKey: string) {
  const holders = await ctx.db
    .query('multiplayerNames')
    .withIndex('by_pet_name', (q) => q.eq('petNameKey', petNameKey))
    .collect();
  if (holders.length === 0) return null;
  holders.sort((a, b) => a._creationTime - b._creationTime);
  return holders[0]!;
}

/** First holder of a display-name key, if any (safe when duplicate rows exist). */
async function displayNameHolder(ctx: MutationCtx, displayNameKey: string) {
  const holders = await ctx.db
    .query('multiplayerNames')
    .withIndex('by_display_name', (q) => q.eq('displayNameKey', displayNameKey))
    .collect();
  if (holders.length === 0) return null;
  holders.sort((a, b) => a._creationTime - b._creationTime);
  return holders[0]!;
}

/**
 * Allocate a free pet name. `rawName` may be a validated name (preferred casing
 * kept) or a messy legacy string (cleaned via {@link legacyPetBase}).
 */
async function availablePetName(ctx: MutationCtx, userId: Id<'users'>, rawName: string) {
  let base: string;
  try {
    base = validatePetName(rawName);
  } catch {
    base = legacyPetBase(rawName);
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const candidate = `${truncateForSuffix(base, 16 - suffix.length).trimEnd()}${suffix}`;
    // Suffix can re-introduce characters validatePetName would reject only if
    // base was legacy-cleaned; validated bases stay legal with "-N".
    const owner = await petNameHolder(ctx, profileNameKey(candidate));
    if (!owner || owner.userId === userId) return candidate;
  }
  for (let salt = 0; salt < 100; salt += 1) {
    const candidate = `P-${stableUserSuffix(userId, salt)}`;
    const owner = await petNameHolder(ctx, profileNameKey(candidate));
    if (!owner || owner.userId === userId) return candidate;
  }
  throw new Error('Could not allocate a unique pet name');
}

async function availableDisplayName(ctx: MutationCtx, userId: Id<'users'>, rawName: string | undefined) {
  let base = 'Player';
  try {
    base = validateDisplayName(rawName ?? base);
  } catch {
    // OAuth display names are not guaranteed to satisfy the in-game name rules.
  }
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const candidate = `${truncateForSuffix(base, 20 - suffix.length).trimEnd()}${suffix}`;
    const owner = await displayNameHolder(ctx, profileNameKey(candidate));
    if (!owner || owner.userId === userId) return candidate;
  }
  for (let salt = 0; salt < 100; salt += 1) {
    const candidate = `Player-${stableUserSuffix(userId, salt)}`;
    const owner = await displayNameHolder(ctx, profileNameKey(candidate));
    if (!owner || owner.userId === userId) return candidate;
  }
  throw new Error('Could not allocate a unique player name');
}

export const getMine = query({
  args: {},
  returns: v.union(saveDoc, v.null()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("saves")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
  },
});

export async function upsertCanonicalSave(
  ctx: MutationCtx,
  userId: Id<'users'>,
  args: SaveFields,
  options: { allowPetNameChange?: boolean } = {},
) {
  if (args.townPosition && !isSafeTownPosition(args.townPosition.x, args.townPosition.y)) {
    throw new Error("Town position is outside the safe playable map");
  }

  const [existing, ownNames, user] = await Promise.all([
    ctx.db.query("saves").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
    ctx.db.query("multiplayerNames").withIndex("by_user", (q) => q.eq("userId", userId)).unique(),
    ctx.db.get(userId),
  ]);
  let petName = args.petName;
  let petNameKey: string | null = null;
  let legacyPetNameKey: string | undefined;
  let displayName = ownNames?.displayName;
  let displayNameKey = ownNames?.displayNameKey;
  if (args.adopted) {
    const incomingPetNameKey = profileNameKey(args.petName);
    const retainingExistingCanonicalName = Boolean(
      existing?.adopted && ownNames && !options.allowPetNameChange,
    );
    const provisioningLegacySave = Boolean(
      existing?.adopted &&
      !ownNames &&
      profileNameKey(existing.petName) === incomingPetNameKey,
    );
    const replayingLegacyName = Boolean(
      ownNames?.legacyPetNameKey && ownNames.legacyPetNameKey === incomingPetNameKey,
    );
    if (retainingExistingCanonicalName && ownNames) {
      petName = ownNames.petName;
      petNameKey = ownNames.petNameKey;
      legacyPetNameKey = ownNames.legacyPetNameKey;
    } else if (replayingLegacyName && ownNames) {
      petName = ownNames.petName;
      petNameKey = ownNames.petNameKey;
      legacyPetNameKey = ownNames.legacyPetNameKey;
    } else if (provisioningLegacySave) {
      // Pre-names-table adopted saves may have invalid / colliding pet names.
      petName = await availablePetName(ctx, userId, args.petName);
      petNameKey = profileNameKey(petName);
      legacyPetNameKey = incomingPetNameKey !== petNameKey ? incomingPetNameKey : undefined;
    } else {
      // Fresh adoption (including change-pet). Validate the requested name,
      // then reserve it — or the next free suffix if two villagers pick the
      // same default at once. Explicit renames still go through profiles.
      const requested = validatePetName(args.petName);
      petName = await availablePetName(ctx, userId, requested);
      petNameKey = profileNameKey(petName);
      const retainingCanonicalName = ownNames?.petNameKey === petNameKey;
      legacyPetNameKey = retainingCanonicalName ? ownNames?.legacyPetNameKey : undefined;
    }
    if (!displayName || !displayNameKey) {
      displayName = await availableDisplayName(ctx, userId, user?.name);
      displayNameKey = profileNameKey(displayName);
    }
  }

  const now = Date.now();
  const payload = { ...args, petName, userId, updatedAt: now };
  const saveId = existing?._id ?? await ctx.db.insert("saves", payload);
  if (existing) await ctx.db.patch(existing._id, payload);
  if (args.adopted && petNameKey && displayName && displayNameKey) {
    const namesPayload = {
      displayName,
      displayNameKey,
      petName,
      petNameKey,
      legacyPetNameKey,
      updatedAt: now,
    };
    if (ownNames) {
      await ctx.db.patch(ownNames._id, namesPayload);
    } else {
      await ctx.db.insert("multiplayerNames", { userId, ...namesPayload });
    }
    // Concurrent adopters can both pass availablePetName before either insert
    // lands. The older multiplayerNames row wins; throwing aborts this whole
    // mutation (Convex rolls the save + names write back) so the client can
    // retry and receive a free suffix.
    const holder = await petNameHolder(ctx, petNameKey);
    if (holder && holder.userId !== userId) {
      throw new Error('That pet name is already taken');
    }
    // Password sign-ups have no provider name, so `viewer.name` would stay
    // undefined until a rename and the topbar would disagree with the nametag.
    if (user && user.name !== displayName) await ctx.db.patch(userId, { name: displayName });
  }
  return { saveId, petName };
}

export const upsertMine = mutation({
  args: saveFields,
  returns: v.object({ saveId: v.id("saves"), petName: v.string() }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    return await upsertCanonicalSave(ctx, userId, args);
  },
});
