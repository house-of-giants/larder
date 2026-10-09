import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/** What a ledger event stores for a pantry row: everything needed to put it back. */
export type PantrySnapshot = Omit<
  Doc<"pantryItems">,
  "_id" | "_creationTime" | "householdId" | "updatedAt"
>;

export function pantrySnapshot(row: PantrySnapshot): PantrySnapshot {
  return {
    ingredientId: row.ingredientId,
    location: row.location,
    ...(row.count !== undefined && { count: row.count }),
    ...(row.level !== undefined && { level: row.level }),
    ...(row.purchaseNote !== undefined && { purchaseNote: row.purchaseNote }),
    ...(row.expiresAt !== undefined && { expiresAt: row.expiresAt }),
  };
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
