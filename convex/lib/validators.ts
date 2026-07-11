import { v } from "convex/values";

export const petSpeciesValidator = v.optional(
  v.union(
    v.literal("mametchi"),
    v.literal("kuchipatchi"),
    v.literal("mimitchi"),
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
