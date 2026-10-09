import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireMember } from "./lib/auth";
import schema from "./schema";

const defaultLimit = 50;
const maxLimit = 200;

/** A whole number from 1 to 200; anything that is not a finite number means the default. */
function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return defaultLimit;
  return Math.min(Math.max(Math.floor(limit), 1), maxLimit);
}

export const recent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("inventoryEvents"),
      _creationTime: v.number(),
      ...schema.tables.inventoryEvents.validator.fields,
    }),
  ),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const limit = clampLimit(args.limit);
    return await ctx.db
      .query("inventoryEvents")
      .withIndex("by_householdId_at", (q) => q.eq("householdId", householdId))
      .order("desc")
      .take(limit);
  },
});
