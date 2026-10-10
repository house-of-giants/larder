import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Prepared food is what a cook leaves in the fridge. `remaining` is a view over the
// ledger: every change writes an inventory event whose payload carries a FoodSnapshot
// before and after, plus the food's name so the event still reads after undo removes it.

export const foodNotHere = "That food is not here.";

export type FoodSnapshot = Pick<Doc<"preparedFoods">, "status" | "remaining" | "location"> & {
  weekId?: Id<"weeks">;
};

export function foodSnapshot(food: FoodSnapshot): FoodSnapshot {
  return {
    status: food.status,
    remaining: food.remaining,
    location: food.location,
    ...(food.weekId !== undefined && { weekId: food.weekId }),
  };
}

/** What every prepared-food event payload carries. */
export type FoodPayload = {
  name: string;
  unit: string;
  before: FoodSnapshot | null;
  after: FoodSnapshot | null;
};

/** The food, only if it belongs to this household. */
export async function requireFood(
  ctx: QueryCtx,
  householdId: Id<"households">,
  preparedFoodId: Id<"preparedFoods">,
): Promise<Doc<"preparedFoods">> {
  const food = await ctx.db.get("preparedFoods", preparedFoodId);
  if (food === null || food.householdId !== householdId) {
    throw new ConvexError(foodNotHere);
  }
  return food;
}

/** Only food still in the fridge or freezer can be eaten, tossed, or moved. */
export function requireAvailable(food: Doc<"preparedFoods">) {
  if (food.status !== "available") {
    throw new ConvexError(
      food.status === "consumed" ? `${food.name} is all eaten.` : `${food.name} was tossed.`,
    );
  }
}
