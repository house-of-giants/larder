import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** Omit, applied to each member of a union (plain Omit keeps only the shared keys). */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/**
 * What a ledger event stores for a pantry row: everything needed to put it back. A count
 * snapshot or a level snapshot, like the row.
 */
export type PantrySnapshot = OmitEach<
  Doc<"pantryItems">,
  "_id" | "_creationTime" | "householdId" | "updatedAt"
>;

/** The row's own fields, without ids or timestamps; `row` may be a whole document. */
export function pantrySnapshot(row: PantrySnapshot): PantrySnapshot {
  const common = {
    ingredientId: row.ingredientId,
    location: row.location,
    ...(row.purchaseNote !== undefined && { purchaseNote: row.purchaseNote }),
    ...(row.expiresAt !== undefined && { expiresAt: row.expiresAt }),
  };
  return row.kind === "count"
    ? { kind: "count", count: row.count, ...common }
    : { kind: "level", level: row.level, ...common };
}

/** The ingredient, only if it belongs to this household. */
export async function requireIngredient(
  ctx: QueryCtx,
  householdId: Id<"households">,
  ingredientId: Id<"ingredients">,
): Promise<Doc<"ingredients">> {
  const ingredient = await ctx.db.get(ingredientId);
  if (ingredient === null || ingredient.householdId !== householdId) {
    throw new ConvexError("That ingredient is not in this household.");
  }
  return ingredient;
}

export async function findPantryRow(
  ctx: QueryCtx,
  householdId: Id<"households">,
  ingredientId: Id<"ingredients">,
): Promise<Doc<"pantryItems"> | null> {
  return await ctx.db
    .query("pantryItems")
    .withIndex("by_householdId_ingredientId", (q) =>
      q.eq("householdId", householdId).eq("ingredientId", ingredientId),
    )
    .first();
}
