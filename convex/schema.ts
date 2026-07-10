import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

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

export default defineSchema({
  ...authTables,

  // Cloud save per authenticated user (mirrors client SaveData).
  saves: defineTable({
    userId: v.id("users"),
    version: v.number(),
    coins: v.number(),
    petName: v.string(),
    petSpecies: v.optional(
      v.union(
        v.literal("mametchi"),
        v.literal("kuchipatchi"),
        v.literal("mimitchi"),
      ),
    ),
    adopted: v.optional(v.boolean()),
    pet: petStats,
    lastSeen: v.number(),
    // itemId -> count
    inventory: v.record(v.string(), v.number()),
    placed: v.array(placedItem),
    bestPaperToss: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
});
