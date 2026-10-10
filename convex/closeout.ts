import { ConvexError, type ObjectType, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, mutation } from "./_generated/server";
import { type Caller, requireCaller } from "./lib/auth";
import { recordInventoryEvent } from "./lib/ledger";
import { type FoodSnapshot, foodNotHere, foodSnapshot } from "./lib/prepared_food";
import type { CloseoutPayload } from "./lib/reversals";
import { findOpenWeek, requireWeek } from "./lib/weeks";

// The weekly closeout is the leftovers reconcile: every prepared food still available is
// eaten (the default), tossed, or kept and carried into the next week. The week closes and
// the next one opens, all in one mutation, with one `closeout` event per food.

const outcome = v.union(v.literal("eaten"), v.literal("tossed"), v.literal("keep"));
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const runArgs = {
  weekId: v.id("weeks"),
  decisions: v.array(v.object({ preparedFoodId: v.id("preparedFoods"), outcome })),
  /** The phone's own date for the new week; the server's UTC date when absent. */
  weekOf: v.optional(v.string()),
};

export const run = mutation({
  args: runArgs,
  returns: v.id("weeks"),
  handler: async (ctx, args) => closeOutWeek(ctx, await requireCaller(ctx), args),
});

export async function closeOutWeek(
  ctx: MutationCtx,
  { householdId, actor }: Caller,
  args: ObjectType<typeof runArgs>,
) {
  const week = await requireWeek(ctx, householdId, args.weekId);
  if (week.status === "closed") {
    throw new ConvexError("This week is closed.");
  }
  if (week.status === "planning") {
    throw new ConvexError("Nothing to close yet. This week is still being planned.");
  }
  const weekOf = args.weekOf?.trim() || new Date().toISOString().slice(0, 10);
  if (!datePattern.test(weekOf) || Number.isNaN(Date.parse(weekOf))) {
    throw new ConvexError("Use a date like 2026-10-09.");
  }

  // Everything still in the fridge or freezer is part of the reconcile.
  const foods = await ctx.db
    .query("preparedFoods")
    .withIndex("by_householdId_status", (q) =>
      q.eq("householdId", householdId).eq("status", "available"),
    )
    .collect();
  const byId = new Map(foods.map((f) => [f._id, f]));
  const decided = new Map<Doc<"preparedFoods">["_id"], "eaten" | "tossed" | "keep">();
  for (const d of args.decisions) {
    if (!byId.has(d.preparedFoodId)) throw new ConvexError(foodNotHere);
    decided.set(d.preparedFoodId, d.outcome);
  }

  await ctx.db.patch("weeks", week._id, { status: "closed" });
  const open = await findOpenWeek(ctx, householdId);
  const nextWeekId =
    open?._id ??
    (await ctx.db.insert("weeks", {
      householdId,
      weekOf,
      status: "planning",
      sourceUrls: [],
      createdAt: Date.now(),
    }));

  for (const food of foods) {
    const result = decided.get(food._id) ?? "eaten";
    const next: FoodSnapshot =
      result === "eaten"
        ? { ...foodSnapshot(food), status: "consumed", remaining: { text: "0", decimal: 0 } }
        : result === "tossed"
          ? { ...foodSnapshot(food), status: "discarded" }
          : { ...foodSnapshot(food), weekId: nextWeekId };
    await ctx.db.patch("preparedFoods", food._id, {
      status: next.status,
      remaining: next.remaining,
      weekId: next.weekId,
    });
    await recordInventoryEvent(ctx, {
      householdId,
      type: "closeout",
      actor,
      refs: { preparedFoodId: food._id },
      payload: {
        name: food.name,
        unit: food.unit,
        outcome: result,
        before: foodSnapshot(food),
        after: next,
      } satisfies CloseoutPayload,
    });
  }
  return nextWeekId;
}
