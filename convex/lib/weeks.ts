import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export const weekNotHere = "That week is not here.";

/** The week, only if it belongs to this household. */
export async function requireWeek(
  ctx: QueryCtx,
  householdId: Id<"households">,
  weekId: Id<"weeks">,
): Promise<Doc<"weeks">> {
  const week = await ctx.db.get("weeks", weekId);
  if (week === null || week.householdId !== householdId) {
    throw new ConvexError(weekNotHere);
  }
  return week;
}

/** The household's week that is not closed yet, newest first; null when there is none. */
export async function findOpenWeek(
  ctx: QueryCtx,
  householdId: Id<"households">,
): Promise<Doc<"weeks"> | null> {
  const weeks = await ctx.db
    .query("weeks")
    .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
    .collect();
  const open = weeks.filter((w) => w.status !== "closed");
  open.sort((a, b) => b.createdAt - a.createdAt);
  return open[0] ?? null;
}

/** The plan can change until cooking starts; after shopping starts, regenerate the list. */
export function requirePlannable(week: Doc<"weeks">) {
  if (week.status !== "planning" && week.status !== "shopping") {
    throw new ConvexError("The plan is set for this week.");
  }
}

/** Rows of a week-scoped table that belong to this household's week. */
export async function weekRows<T extends "weekRecipes" | "weekAdaptations" | "lists">(
  ctx: QueryCtx,
  table: T,
  householdId: Id<"households">,
  weekId: Id<"weeks">,
): Promise<Doc<T>[]> {
  // All three tables share the `by_householdId_weekId` index; TypeScript cannot see that
  // through the generic, so the query is typed as one of them.
  const rows = await ctx.db
    .query(table as "weekRecipes")
    .withIndex("by_householdId_weekId", (q) =>
      q.eq("householdId", householdId).eq("weekId", weekId),
    )
    .collect();
  return rows as unknown as Doc<T>[];
}
