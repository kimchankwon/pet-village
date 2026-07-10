import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

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

const saveFields = {
  version: v.number(),
  coins: v.number(),
  petName: v.string(),
  pet: petStats,
  lastSeen: v.number(),
  inventory: v.record(v.string(), v.number()),
  placed: v.array(placedItem),
  bestPaperToss: v.number(),
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
