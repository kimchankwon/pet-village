import { v } from "convex/values";

export const petSpeciesValidator = v.optional(
  v.union(
    v.literal("mametchi"),
    v.literal("kuchipatchi"),
    v.literal("mimitchi"),
    v.literal("bongbongee"),
    v.literal("cinnamoroll"),
    v.literal("kirby"),
    v.literal("puffle-blue"),
    v.literal("puffle-pink"),
    v.literal("puffle-green"),
    v.literal("puffle-black"),
    v.literal("puffle-purple"),
    v.literal("puffle-red"),
    v.literal("puffle-yellow"),
    v.literal("puffle-white"),
  ),
);

export const equippedAccessoriesValidator = v.optional(
  v.object({
    headLeft: v.optional(v.string()),
    headRight: v.optional(v.string()),
    body: v.optional(v.string()),
    extra: v.optional(v.string()),
  }),
);
