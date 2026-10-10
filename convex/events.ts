import { v } from "convex/values";
import { type QueryCtx, query } from "./_generated/server";
import { type Caller, requireCaller } from "./lib/auth";
import schema from "./schema";

const defaultLimit = 50;
const maxLimit = 200;

/** A whole number from 1 to 200; anything that is not a finite number means the default. */
function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return defaultLimit;
  return Math.min(Math.max(Math.floor(limit), 1), maxLimit);
}

export const inventoryEventDoc = v.object({
  _id: v.id("inventoryEvents"),
  _creationTime: v.number(),
  ...schema.tables.inventoryEvents.validator.fields,
});

export const recent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(inventoryEventDoc),
  handler: async (ctx, args) => recentEvents(ctx, await requireCaller(ctx), args),
});

export async function recentEvents(
  ctx: QueryCtx,
  { householdId }: Caller,
  args: { limit?: number },
) {
  const limit = clampLimit(args.limit);
  return await ctx.db
    .query("inventoryEvents")
    .withIndex("by_householdId_at", (q) => q.eq("householdId", householdId))
    .order("desc")
    .take(limit);
}
