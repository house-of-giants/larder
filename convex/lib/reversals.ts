import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recordInventoryEvent } from "./ledger";
import { type PantrySnapshot, findPantryRow, pantrySnapshot } from "./pantry";
import { type FoodPayload, type FoodSnapshot, foodNotHere, foodSnapshot } from "./prepared_food";
import { formatQuantity } from "./quantities";

// Undo reads an event's before/after snapshot back, puts the view right, and writes an
// `undo` event pointing at the original through `undoesEventId`. Where someone has changed
// the row since, undo takes back only what the original changed and keeps the rest.

export const alreadyUndone = "Already undone.";
export const cookNotHere = "That cook is not here.";

/** What a cooking deduction stores: the pantry row before and after, and the shortfall. */
export type DeductionPayload = {
  before: PantrySnapshot;
  after: PantrySnapshot;
  wentNegative: boolean;
  /** What the recipe called for, in the pantry's unit; null for a level. */
  used: number | null;
};

/** The undo event that reverses `event`, if any. An undo is always newer than its target. */
export async function findUndo(
  ctx: QueryCtx,
  householdId: Id<"households">,
  event: Doc<"inventoryEvents">,
): Promise<Doc<"inventoryEvents"> | null> {
  for await (const later of ctx.db
    .query("inventoryEvents")
    .withIndex("by_householdId_at", (q) => q.eq("householdId", householdId).gte("at", event.at))) {
    if (later.undoesEventId === event._id) return later;
  }
  return null;
}

/** The ledger rows a cook wrote (its deductions and the prepared food), oldest first. */
async function cookEvents(ctx: QueryCtx, cook: Doc<"cookingEvents">) {
  const rows: Doc<"inventoryEvents">[] = [];
  for await (const event of ctx.db
    .query("inventoryEvents")
    .withIndex("by_householdId_at", (q) =>
      q.eq("householdId", cook.householdId).gte("at", cook.cookedAt),
    )) {
    if (event.refs.cookingEventId === cook._id && event.type !== "undo") rows.push(event);
  }
  return rows;
}

/** The prepared food a cook made, if it made one and it is still there. */
export async function foodOfCook(ctx: QueryCtx, cook: Doc<"cookingEvents">) {
  const foods = await ctx.db
    .query("preparedFoods")
    .withIndex("by_householdId", (q) => q.eq("householdId", cook.householdId))
    .collect();
  return foods.find((f) => f.cookingEventId === cook._id) ?? null;
}

/** Puts a deducted pantry row back: counts get the amount back, levels step back up. */
async function restoreDeduction(
  ctx: MutationCtx,
  householdId: Id<"households">,
  payload: DeductionPayload,
): Promise<{
  pantryItemId: Id<"pantryItems">;
  before: PantrySnapshot | null;
  after: PantrySnapshot;
}> {
  const current = await findPantryRow(ctx, householdId, payload.after.ingredientId);
  let restored: PantrySnapshot;
  if (current === null) {
    restored = payload.before;
  } else {
    const now = current.count;
    const was = payload.before.count;
    const left = payload.after.count;
    if (now !== undefined && was !== undefined && left !== undefined) {
      if (now.unit.trim() !== left.unit.trim()) {
        restored = pantrySnapshot(current);
      } else if (now.quantityDecimal === left.quantityDecimal) {
        // Untouched since the cook: the original words come back too.
        restored = pantrySnapshot({ ...current, count: was });
      } else {
        const total = now.quantityDecimal + (was.quantityDecimal - left.quantityDecimal);
        restored = pantrySnapshot({
          ...current,
          count: { quantityText: formatQuantity(total), quantityDecimal: total, unit: now.unit },
        });
      }
    } else if (
      current.level !== undefined &&
      payload.before.level !== undefined &&
      current.level === payload.after.level
    ) {
      restored = pantrySnapshot({ ...current, level: payload.before.level });
    } else {
      // Set to something else since the cook; that newer word stands.
      restored = pantrySnapshot(current);
    }
  }

  const row = { householdId, ...restored, updatedAt: Date.now() };
  if (current === null) {
    const pantryItemId = await ctx.db.insert("pantryItems", row);
    return { pantryItemId, before: null, after: restored };
  }
  await ctx.db.replace("pantryItems", current._id, row);
  return { pantryItemId: current._id, before: pantrySnapshot(current), after: restored };
}

/**
 * Reverses a cook: every deduction goes back, the prepared food is removed (the one thing
 * undo removes, and only while nobody has eaten from it), and the cook is marked undone.
 */
export async function undoCook(
  ctx: MutationCtx,
  householdId: Id<"households">,
  memberId: Id<"members">,
  cookingEventId: Id<"cookingEvents">,
) {
  const cook = await ctx.db.get("cookingEvents", cookingEventId);
  if (cook === null || cook.householdId !== householdId) {
    throw new ConvexError(cookNotHere);
  }
  if (cook.undoneAt !== undefined) {
    throw new ConvexError(alreadyUndone);
  }
  const food = await foodOfCook(ctx, cook);
  if (food !== null) {
    if (food.status === "discarded") {
      throw new ConvexError(`${food.name} was tossed. Undo that first.`);
    }
    if (food.status !== "available" || food.remaining.decimal < food.starting.decimal) {
      throw new ConvexError("Someone already ate from this. Undo those first.");
    }
  }

  const actor = { kind: "member" as const, memberId };
  for (const event of await cookEvents(ctx, cook)) {
    if (event.type === "deduction") {
      const restored = await restoreDeduction(ctx, householdId, event.payload as DeductionPayload);
      await recordInventoryEvent(ctx, {
        householdId,
        type: "undo",
        actor,
        refs: { pantryItemId: restored.pantryItemId, cookingEventId: cook._id },
        payload: { before: restored.before, after: restored.after },
        undoesEventId: event._id,
      });
    } else if (event.refs.preparedFoodId !== undefined && food?._id === event.refs.preparedFoodId) {
      await ctx.db.delete("preparedFoods", food._id);
      await recordInventoryEvent(ctx, {
        householdId,
        type: "undo",
        actor,
        refs: { preparedFoodId: food._id, cookingEventId: cook._id },
        payload: {
          name: food.name,
          unit: food.unit,
          before: foodSnapshot(food),
          after: null,
        } satisfies FoodPayload,
        undoesEventId: event._id,
      });
    }
  }
  await ctx.db.patch("cookingEvents", cook._id, { undoneAt: Date.now() });
}

/** What a consumption stores: how much was eaten, beside the snapshots. */
export type ConsumptionPayload = FoodPayload & { eaten: { text: string; decimal: number } };

/** What a closeout stores for each food. */
export type CloseoutPayload = FoodPayload & { outcome: "eaten" | "tossed" | "keep" };

async function requireEventFood(
  ctx: MutationCtx,
  householdId: Id<"households">,
  event: Doc<"inventoryEvents">,
) {
  const id = event.refs.preparedFoodId;
  const food = id === undefined ? null : await ctx.db.get("preparedFoods", id);
  if (food === null || food.householdId !== householdId) {
    throw new ConvexError(foodNotHere);
  }
  return food;
}

async function writeFood(
  ctx: MutationCtx,
  householdId: Id<"households">,
  memberId: Id<"members">,
  food: Doc<"preparedFoods">,
  next: FoodSnapshot,
  undoesEventId: Id<"inventoryEvents">,
) {
  await ctx.db.patch("preparedFoods", food._id, {
    status: next.status,
    remaining: next.remaining,
    location: next.location,
    weekId: next.weekId,
  });
  await recordInventoryEvent(ctx, {
    householdId,
    type: "undo",
    actor: { kind: "member", memberId },
    refs: { preparedFoodId: food._id },
    payload: {
      name: food.name,
      unit: food.unit,
      before: foodSnapshot(food),
      after: foodSnapshot(next),
    } satisfies FoodPayload,
    undoesEventId,
  });
}

/** Puts back what was eaten; food that was all eaten is available again. */
export async function undoConsumption(
  ctx: MutationCtx,
  householdId: Id<"households">,
  memberId: Id<"members">,
  event: Doc<"inventoryEvents">,
) {
  const food = await requireEventFood(ctx, householdId, event);
  const payload = event.payload as ConsumptionPayload;
  const untouched =
    payload.after !== null && food.remaining.decimal === payload.after.remaining.decimal;
  const decimal = food.remaining.decimal + payload.eaten.decimal;
  const remaining =
    untouched && payload.before !== null
      ? payload.before.remaining
      : { text: formatQuantity(decimal), decimal };
  await writeFood(
    ctx,
    householdId,
    memberId,
    food,
    {
      ...foodSnapshot(food),
      remaining,
      status: food.status === "consumed" && remaining.decimal > 0 ? "available" : food.status,
    },
    event._id,
  );
}

/** Reopens a food the closeout ate, tossed, or carried; the closed week stays closed. */
export async function undoCloseout(
  ctx: MutationCtx,
  householdId: Id<"households">,
  memberId: Id<"members">,
  event: Doc<"inventoryEvents">,
) {
  const food = await requireEventFood(ctx, householdId, event);
  const { before, after, outcome } = event.payload as CloseoutPayload;
  if (before === null || after === null) throw new ConvexError(foodNotHere);
  // A carried food may have been eaten from since; that stands.
  const untouched = food.remaining.decimal === after.remaining.decimal;
  const decimal = food.remaining.decimal + (before.remaining.decimal - after.remaining.decimal);
  await writeFood(
    ctx,
    householdId,
    memberId,
    food,
    {
      status: outcome === "keep" ? food.status : before.status,
      remaining: untouched ? before.remaining : { text: formatQuantity(decimal), decimal },
      location: food.location,
      weekId: before.weekId,
    },
    event._id,
  );
}
