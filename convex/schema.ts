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
    expeditionWins: v.optional(v.record(v.string(), v.number())),
    ownedAccessories: v.optional(v.array(v.string())),
    equippedAccessories: equippedAccessoriesValidator,
    penguinColor: v.optional(v.string()),
    townPosition: v.optional(townPosition),
    /** Quest progress keyed by id: "active" | "completed". Missing = available. */
    quests: v.optional(v.record(v.string(), v.union(v.literal("active"), v.literal("completed")))),
    /** Activity-quest counters (e.g. Skip Rope clears), keyed by quest id. */
    questCounters: v.optional(v.record(v.string(), v.number())),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  presence: defineTable({
    userId: v.id("users"),
    sessionId: v.string(),
    displayName: v.string(),
    petName: v.string(),
    petSpecies: v.string(),
    penguinColor: v.string(),
    accessoryHeadLeft: v.string(),
    accessoryHeadRight: v.string(),
    accessoryBody: v.string(),
    accessoryExtra: v.string(),
    x: v.number(),
    y: v.number(),
    petX: v.number(),
    petY: v.number(),
    facing: v.string(),
    moving: v.boolean(),
    active: v.boolean(),
    seq: v.number(),
    scene: v.string(),
    activity: v.string(),
    waveId: v.string(),
    waveTarget: v.string(),
    chatId: v.string(),
    chatText: v.string(),
    emote: v.string(),
    petEmote: v.string(),
    petEmoteId: v.string(),
    lastChatAt: v.number(),
    lastWaveAt: v.number(),
    lastEmoteAt: v.number(),
    lastProfileRefreshAt: v.number(),
    reentryScene: v.optional(v.string()),
    restoring: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"]),

  townNpcs: defineTable({
    npcId: v.string(),
    x: v.number(),
    y: v.number(),
    facing: v.union(v.literal("left"), v.literal("right")),
    moving: v.boolean(),
    updatedAt: v.number(),
    destination: v.number(),
    pauseUntil: v.number(),
  }).index("by_npc", ["npcId"]),

  townSim: defineTable({
    key: v.literal("town"),
    lastStepAt: v.number(),
    tickScheduled: v.boolean(),
  }).index("by_key", ["key"]),

  sledRace: defineTable({
    key: v.literal("default"),
    phase: v.string(),
    leader: v.string(),
    difficulty: v.string(),
    seed: v.string(),
    countdownAt: v.number(),
    startedAt: v.number(),
    serverTime: v.number(),
    round: v.number(),
    course: v.array(v.object({
      id: v.string(),
      kind: v.string(),
      x: v.number(),
      progress: v.number(),
      radius: v.number(),
    })),
    finishCount: v.number(),
    hitItems: v.record(v.string(), v.array(v.string())),
    lastInputAt: v.record(v.string(), v.number()),
    lanes: v.record(v.string(), v.array(v.object({ progress: v.number(), x: v.number() }))),
    effectSource: v.record(v.string(), v.string()),
    sweptIndex: v.record(v.string(), v.number()),
    rejectedClaims: v.array(v.object({ sessionId: v.string(), itemId: v.string() })),
    tickScheduled: v.boolean(),
  }).index("by_key", ["key"]),

  sledRacers: defineTable({
    sessionId: v.string(),
    userId: v.id("users"),
    displayName: v.string(),
    penguinColor: v.string(),
    x: v.number(),
    progress: v.number(),
    speed: v.number(),
    steering: v.number(),
    inputSeq: v.number(),
    effect: v.string(),
    effectUntil: v.number(),
    finishedAt: v.number(),
    rank: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"]),
});
