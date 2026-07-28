import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
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

const townPosition = v.object({
  x: v.number(),
  y: v.number(),
  facing: v.union(v.literal("up"), v.literal("down"), v.literal("side")),
});

export default defineSchema({
  ...authTables,

  // Cloud save per authenticated user (mirrors client SaveData).
  multiplayerNames: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    displayNameKey: v.string(),
    petName: v.string(),
    petNameKey: v.string(),
    legacyPetNameKey: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_display_name", ["displayNameKey"])
    .index("by_pet_name", ["petNameKey"]),

  saves: defineTable({
    userId: v.id("users"),
    version: v.number(),
    coins: v.number(),
    petName: v.string(),
    petSpecies: petSpeciesValidator,
    adopted: v.optional(v.boolean()),
    pet: petStats,
    lastSeen: v.number(),
    // itemId -> count
    inventory: v.record(v.string(), v.number()),
    placed: v.array(placedItem),
    bestPaperToss: v.number(),
    biggestCatch: v.optional(v.number()),
    bestSkipRope: v.optional(v.number()),
    ownedAccessories: v.optional(v.array(v.string())),
    equippedAccessories: equippedAccessoriesValidator,
    penguinColor: v.optional(v.string()),
    townPosition: v.optional(townPosition),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
});
