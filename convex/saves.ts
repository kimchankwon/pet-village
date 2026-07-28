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
  assertProfileNamesAvailable,
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
  facing: v.union(v.literal("up"), v.literal("down"), v.literal("side")),
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

async function availablePetName(ctx: MutationCtx, userId: Id<'users'>, rawName: string) {
  const base = legacyPetBase(rawName);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`;
    const candidate = `${truncateForSuffix(base, 16 - suffix.length).trimEnd()}${suffix}`;
    const owner = await ctx.db
      .query('multiplayerNames')
      .withIndex('by_pet_name', (q) => q.eq('petNameKey', profileNameKey(candidate)))
      .unique();
    if (!owner || owner.userId === userId) return candidate;
  }
  for (let salt = 0; salt < 100; salt += 1) {
    const candidate = `P-${stableUserSuffix(userId, salt)}`;
    const owner = await ctx.db
      .query('multiplayerNames')
      .withIndex('by_pet_name', (q) => q.eq('petNameKey', profileNameKey(candidate)))
      .unique();
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
    const candidate = `${truncateForSuffix(base, 20 - suffix.length)}${suffix}`;
    const owner = await ctx.db
      .query('multiplayerNames')
      .withIndex('by_display_name', (q) => q.eq('displayNameKey', profileNameKey(candidate)))
      .unique();
    if (!owner || owner.userId === userId) return candidate;
  }
  for (let salt = 0; salt < 100; salt += 1) {
    const candidate = `Player-${stableUserSuffix(userId, salt)}`;
    const owner = await ctx.db
      .query('multiplayerNames')
      .withIndex('by_display_name', (q) => q.eq('displayNameKey', profileNameKey(candidate)))
      .unique();
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
    } else {
      petName = provisioningLegacySave
        ? await availablePetName(ctx, userId, args.petName)
        : validatePetName(args.petName);
      petNameKey = profileNameKey(petName);
      const retainingCanonicalName = ownNames?.petNameKey === petNameKey;
      legacyPetNameKey = provisioningLegacySave && incomingPetNameKey !== petNameKey
        ? incomingPetNameKey
        : retainingCanonicalName
          ? ownNames?.legacyPetNameKey
          : undefined;
    }
    if (!provisioningLegacySave && !replayingLegacyName) {
      const reservedPet = await ctx.db
        .query("multiplayerNames")
        .withIndex("by_pet_name", (q) => q.eq("petNameKey", petNameKey!))
        .unique();
      assertProfileNamesAvailable(userId, undefined, reservedPet?.userId);
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
