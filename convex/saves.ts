import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  equippedAccessoriesValidator,
  petSpeciesValidator,
} from "./lib/validators";

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

const TOWN_WORLD_W = 22 * 48;
const TOWN_WORLD_H = 16 * 48;

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

const saveDoc = v.object({
  _id: v.id("saves"),
  _creationTime: v.number(),
  userId: v.id("users"),
  ...saveFields,
  updatedAt: v.number(),
});

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

export const upsertMine = mutation({
  args: saveFields,
  returns: v.id("saves"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    if (
      args.townPosition &&
      (args.townPosition.x < 0 ||
        args.townPosition.x > TOWN_WORLD_W ||
        args.townPosition.y < 0 ||
        args.townPosition.y > TOWN_WORLD_H)
    ) {
      throw new Error("Town position is outside the playable map");
    }

    const existing = await ctx.db
      .query("saves")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const payload = {
      ...args,
      userId,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("saves", payload);
  },
});
