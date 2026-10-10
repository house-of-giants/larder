import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recordInventoryEvent } from "./ledger";
import {
  type PantrySnapshot,
  type StoredPantrySnapshot,
  findPantryRow,
  normalizeSnapshot,
  pantrySnapshot,
} from "./pantry";
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

/** A deduction payload as stored: events from before pantry kinds may lack `kind`. */
type StoredDeductionPayload = Omit<DeductionPayload, "before" | "after"> & {
  before: StoredPantrySnapshot;
  after: StoredPantrySnapshot;
};

export const eventNotHere = "That event is not here.";

/**
 * The household's events, newest-inserted first, down to (not including) `since`. Insertion
 * order, never `at`: a replayed offline tap carries an older `at` than events written before it.
 */
async function* insertedAfter(
  ctx: QueryCtx,
  householdId: Id<"households">,
  since: number,
): AsyncGenerator<Doc<"inventoryEvents">> {
  for await (const event of ctx.db
    .query("inventoryEvents")
    .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
    .order("desc")) {
    if (event._creationTime <= since) return;
    yield event;
  }
}

/** The undo event that reverses `event`, if any; an undo is always inserted after it. */
export async function findUndo(
  ctx: QueryCtx,
  householdId: Id<"households">,
  event: Doc<"inventoryEvents">,
): Promise<Doc<"inventoryEvents"> | null> {
  for await (const later of insertedAfter(ctx, householdId, event._creationTime)) {
    if (later.undoesEventId === event._id) return later;
  }
  return null;
}

/** The ledger rows a cook wrote (its deductions and the prepared food), oldest first. */
async function cookEvents(ctx: QueryCtx, cook: Doc<"cookingEvents">) {
  const rows: Doc<"inventoryEvents">[] = [];
  for await (const event of insertedAfter(ctx, cook.householdId, cook._creationTime)) {
    if (event.refs.cookingEventId === cook._id && event.type !== "undo") rows.push(event);
  }
  return rows.reverse();
}

/** The prepared food a cook made, if it made one and it is still there. */
export async function foodOfCook(ctx: QueryCtx, cook: Doc<"cookingEvents">) {
  const foods = await ctx.db
    .query("preparedFoods")
    .withIndex("by_householdId", (q) => q.eq("householdId", cook.householdId))
    .collect();
  return foods.find((f) => f.cookingEventId === cook._id) ?? null;
}

/**
 * Why a cook cannot be undone, or null when it can. The drawer shows `reason`; the mutation
 * throws `message`. One check for both, so the drawer never offers what undo refuses.
 */
export async function cookBlocker(
  ctx: QueryCtx,
  cook: Doc<"cookingEvents">,
): Promise<{ reason: string; message: string } | null> {
  if (cook.undoneAt !== undefined) return { reason: "Undone.", message: alreadyUndone };
  const food = await foodOfCook(ctx, cook);
  if (food === null) return null;
  if (food.status === "discarded") {
    return { reason: "Tossed since.", message: `${food.name} was tossed, so the cook stays.` };
  }
  if (food.status !== "available" || food.remaining.decimal < food.starting.decimal) {
    return {
      reason: "Someone ate from it.",
      message: "Someone already ate from this. Undo those first.",
    };
  }
  return null;
}

/**
 * A deduction's payload, only if it describes one of this household's ingredients the same
 * way before and after, and its pantry row (when the row still exists) is that ingredient's.
 */
async function requireOwnDeduction(
  ctx: QueryCtx,
  householdId: Id<"households">,
  event: Doc<"inventoryEvents">,
): Promise<DeductionPayload> {
  const payload = event.payload as Partial<StoredDeductionPayload> | null;
  const ingredientId = payload?.after?.ingredientId;
  if (
    payload?.before === undefined ||
    payload.after === undefined ||
    ingredientId === undefined ||
    payload.before.ingredientId !== ingredientId
  ) {
    throw new ConvexError(eventNotHere);
  }
  const id = ctx.db.normalizeId("ingredients", ingredientId);
  const ingredient = id === null ? null : await ctx.db.get("ingredients", id);
  if (ingredient === null || ingredient.householdId !== householdId) {
    throw new ConvexError(eventNotHere);
  }
  if (event.refs.pantryItemId !== undefined) {
    const row = await ctx.db.get("pantryItems", event.refs.pantryItemId);
    if (row !== null && (row.householdId !== householdId || row.ingredientId !== ingredient._id)) {
      throw new ConvexError(eventNotHere);
    }
  }
  return {
    ...(payload as StoredDeductionPayload),
    before: normalizeSnapshot(payload.before),
    after: normalizeSnapshot(payload.after),
  };
}

/**
 * Gives back what the cook took, on top of whatever the row holds now: a count gets the
 * amount actually taken (a short cook took only what was there), a removed row comes back
 * holding just that, and a level steps back up only while it still reads what the cook left.
 * Anything set by hand since stands.
 */
async function restoreDeduction(
  ctx: MutationCtx,
  householdId: Id<"households">,
  payload: DeductionPayload,
): Promise<{
  pantryItemId: Id<"pantryItems"> | undefined;
  before: PantrySnapshot | null;
  after: PantrySnapshot | null;
}> {
  const current = await findPantryRow(ctx, householdId, payload.after.ingredientId);
  const before = current === null ? null : pantrySnapshot(current);
  const was = payload.before;
  const left = payload.after;
  let restored: PantrySnapshot | null = null;

  if (was.kind === "count" && left.kind === "count") {
    const taken = Math.max(0, was.count.quantityDecimal - left.count.quantityDecimal);
    if (current === null) {
      restored = pantrySnapshot({
        ...left,
        count: {
          quantityText: formatQuantity(taken),
          quantityDecimal: taken,
          unit: left.count.unit,
        },
      });
    } else if (current.kind === "count" && current.count.unit.trim() === left.count.unit.trim()) {
      const now = current.count;
      restored = pantrySnapshot({
        ...current,
        // Untouched since the cook: the original words come back too.
        count:
          now.quantityDecimal === left.count.quantityDecimal
            ? was.count
            : {
                quantityText: formatQuantity(now.quantityDecimal + taken),
                quantityDecimal: now.quantityDecimal + taken,
                unit: now.unit,
              },
      });
    }
  } else if (
    was.kind === "level" &&
    left.kind === "level" &&
    current?.kind === "level" &&
    current.level === left.level
  ) {
    restored = pantrySnapshot({ ...current, level: was.level });
  }

  if (restored === null) {
    // A level set by hand since, a count in another unit, or a level row removed: it stands.
    return { pantryItemId: current?._id, before, after: before };
  }
  const row = { householdId, ...restored, updatedAt: Date.now() };
  if (current === null) {
    return { pantryItemId: await ctx.db.insert("pantryItems", row), before, after: restored };
  }
  await ctx.db.replace("pantryItems", current._id, row);
  return { pantryItemId: current._id, before, after: restored };
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
  const blocker = await cookBlocker(ctx, cook);
  if (blocker !== null) throw new ConvexError(blocker.message);
  const food = await foodOfCook(ctx, cook);

  // Every event is checked before anything is written, so a bad one leaves no half-undo.
  const events = await cookEvents(ctx, cook);
  const deductions = new Map<Id<"inventoryEvents">, DeductionPayload>();
  for (const event of events) {
    if (event.type === "deduction") {
      deductions.set(event._id, await requireOwnDeduction(ctx, householdId, event));
    }
  }

  const actor = { kind: "member" as const, memberId };
  for (const event of events) {
    const payload = deductions.get(event._id);
    if (payload !== undefined) {
      const restored = await restoreDeduction(ctx, householdId, payload);
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

/** The food an event points at, only if it is this household's. */
export async function eventFood(
  ctx: QueryCtx,
  householdId: Id<"households">,
  event: Doc<"inventoryEvents">,
) {
  const id = event.refs.preparedFoodId;
  const food = id === undefined ? null : await ctx.db.get("preparedFoods", id);
  return food !== null && food.householdId === householdId ? food : null;
}

async function requireEventFood(
  ctx: QueryCtx,
  householdId: Id<"households">,
  event: Doc<"inventoryEvents">,
) {
  const food = await eventFood(ctx, householdId, event);
  if (food === null) throw new ConvexError(foodNotHere);
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
  // The week the food goes back to must be this household's.
  if (before.weekId !== undefined) {
    const weekId = ctx.db.normalizeId("weeks", before.weekId);
    const week = weekId === null ? null : await ctx.db.get("weeks", weekId);
    if (week === null || week.householdId !== householdId) {
      throw new ConvexError(eventNotHere);
    }
  }
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
