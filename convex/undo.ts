import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { latestEvent, reversePurchase } from "./lists";
import { amountWords } from "./lib/amounts";
import { requireMember } from "./lib/auth";
import type { PantrySnapshot } from "./lib/pantry";
import type { FoodPayload } from "./lib/prepared_food";
import {
  type CloseoutPayload,
  type ConsumptionPayload,
  alreadyUndone,
  cookBlocker,
  eventFood,
  eventNotHere,
  findUndo,
  undoCloseout,
  undoConsumption,
  undoCook,
} from "./lib/reversals";
import schema from "./schema";

// The undo drawer: the household's latest inventory events in plain lines, and one way to
// reverse the ones people take back (a check-off, a cook, a portion eaten, a closeout).
// Every reversal writes `undo` events; the original events stay.

const defaultLimit = 30;
const maxLimit = 100;
// How far back the drawer reads; a cook alone writes one event per ingredient.
const scanLimit = 2000;

const outcomeWords: Record<CloseoutPayload["outcome"], string> = {
  eaten: "eaten",
  tossed: "tossed",
  keep: "kept",
};

/** Names looked up once per call, each checked against the household. */
function namer(ctx: QueryCtx, householdId: Id<"households">) {
  const cache = new Map<string, string | null>();
  async function cached<T extends "ingredients" | "recipes" | "listItems">(
    id: Id<T> | undefined,
    pick: (row: Doc<T>) => string,
  ): Promise<string | null> {
    if (id === undefined) return null;
    if (!cache.has(id)) {
      const row = (await ctx.db.get(id)) as Doc<T> | null;
      cache.set(id, row !== null && row.householdId === householdId ? pick(row) : null);
    }
    return cache.get(id) ?? null;
  }
  return {
    householdId,
    ingredient: (id: Id<"ingredients"> | undefined) => cached<"ingredients">(id, (r) => r.name),
    recipe: (id: Id<"recipes"> | undefined) => cached<"recipes">(id, (r) => r.name),
    listItem: (id: Id<"listItems"> | undefined) => cached<"listItems">(id, (r) => r.displayName),
  };
}
type Namer = ReturnType<typeof namer>;

/** The cook behind an event, only if it is this household's; otherwise an unknown line. */
async function cookLine(ctx: QueryCtx, names: Namer, cookingEventId: Id<"cookingEvents">) {
  const found = await ctx.db.get("cookingEvents", cookingEventId);
  const cook = found !== null && found.householdId === names.householdId ? found : null;
  const recipe = cook === null ? null : await names.recipe(cook.recipeId);
  return { cook, line: `Made ${recipe ?? "a recipe"}` };
}

/** One event in a fridge-note line: "Checked off Hawaiian rolls", "Ate 1 slider". */
async function lineOf(ctx: QueryCtx, names: Namer, event: Doc<"inventoryEvents">): Promise<string> {
  if (event.refs.cookingEventId !== undefined) {
    const { line } = await cookLine(ctx, names, event.refs.cookingEventId);
    return event.type === "undo" ? `Undone: ${line}` : line;
  }
  const food = event.payload as Partial<FoodPayload>;
  const pantry = event.payload as { before?: PantrySnapshot | null; after?: PantrySnapshot | null };
  const ingredient = async () =>
    (await names.ingredient(pantry.after?.ingredientId ?? pantry.before?.ingredientId)) ??
    "something";

  switch (event.type) {
    case "purchase": {
      if (event.refs.listItemId !== undefined) {
        return `Checked off ${(await names.listItem(event.refs.listItemId)) ?? "something"}`;
      }
      return `Put ${await ingredient()} in the pantry`;
    }
    case "adjustment": {
      if (event.refs.preparedFoodId !== undefined) {
        const where = food.after?.location ?? "fridge";
        return `Moved ${food.name ?? "leftovers"} to the ${where}`;
      }
      return pantry.after == null
        ? `Took ${await ingredient()} off the shelf`
        : `Changed ${await ingredient()}`;
    }
    case "deduction":
      return `Used ${await ingredient()}`;
    case "consumption": {
      const { eaten, unit } = event.payload as ConsumptionPayload;
      return `Ate ${amountWords(eaten.text, eaten.decimal, unit)}`;
    }
    case "discard":
      return `Tossed ${food.name ?? "leftovers"}`;
    case "closeout": {
      const { name, outcome } = event.payload as CloseoutPayload;
      return `Closed out ${name}: ${outcomeWords[outcome]}`;
    }
    case "undo": {
      const target =
        event.undoesEventId === undefined ? null : await ctx.db.get(event.undoesEventId);
      if (target === null || target.householdId !== event.householdId) return "Undone";
      return `Undone: ${await lineOf(ctx, names, target)}`;
    }
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return defaultLimit;
  return Math.min(Math.max(Math.floor(limit), 1), maxLimit);
}

export const recent = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      eventId: v.id("inventoryEvents"),
      at: v.number(),
      type: schema.tables.inventoryEvents.validator.fields.type,
      line: v.string(),
      canUndo: v.boolean(),
      /** Why a check-off, cook, portion, or closeout can no longer be undone. */
      reason: v.optional(v.string()),
      /** Undoing a cook takes back every deduction and the leftovers; it asks first. */
      isCook: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const limit = clampLimit(args.limit);
    const names = namer(ctx, householdId);

    type Row = {
      eventId: Id<"inventoryEvents">;
      at: number;
      type: Doc<"inventoryEvents">["type"];
      line: string;
      canUndo: boolean;
      reason?: string;
      isCook: boolean;
    };
    const rows: Row[] = [];
    // Newest-inserted first, so an event's undo (always inserted after it) and anything newer
    // on the same list item are seen before the event itself, whatever their `at`.
    const undone = new Set<Id<"inventoryEvents">>();
    const newerOnItem = new Set<Id<"listItems">>();
    const cookRows = new Set<string>();
    let scanned = 0;

    for await (const event of ctx.db
      .query("inventoryEvents")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .order("desc")) {
      if (rows.length >= limit || scanned >= scanLimit) break;
      scanned += 1;
      const { listItemId, cookingEventId } = event.refs;
      const row = { eventId: event._id, at: event.at, type: event.type, isCook: false };

      if (cookingEventId !== undefined) {
        // A cook's deductions and its leftovers read as one line, and so does their undo.
        const isUndo = event.type === "undo";
        const key = `${cookingEventId}:${isUndo ? "undo" : "cook"}`;
        if (!cookRows.has(key)) {
          cookRows.add(key);
          const { cook, line } = await cookLine(ctx, names, cookingEventId);
          if (isUndo || cook === null) {
            rows.push({ ...row, line: isUndo ? `Undone: ${line}` : line, canUndo: false });
          } else {
            const blocker = await cookBlocker(ctx, cook);
            rows.push({
              ...row,
              line,
              canUndo: blocker === null,
              ...(blocker !== null && { reason: blocker.reason }),
              isCook: true,
            });
          }
        }
      } else {
        // The same preconditions undo.event checks, said in a few words.
        let reason: string | undefined;
        const undoable =
          (event.type === "purchase" && listItemId !== undefined) ||
          event.type === "consumption" ||
          event.type === "closeout";
        if (undoable) {
          if (undone.has(event._id)) reason = "Undone.";
          else if (listItemId !== undefined && newerOnItem.has(listItemId)) {
            reason = "Changed since.";
          } else if (
            event.type !== "purchase" &&
            (await eventFood(ctx, householdId, event)) === null
          ) {
            reason = "Gone.";
          }
        }
        rows.push({
          ...row,
          line: await lineOf(ctx, names, event),
          canUndo: undoable && reason === undefined,
          ...(reason !== undefined && { reason }),
        });
      }

      if (event.undoesEventId !== undefined) undone.add(event.undoesEventId);
      if (listItemId !== undefined) newerOnItem.add(listItemId);
    }
    return rows;
  },
});

export const event = mutation({
  args: { eventId: v.id("inventoryEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId, member } = await requireMember(ctx);
    await undoOne(ctx, householdId, member._id, args.eventId);
    return null;
  },
});

/**
 * Several events undone in one transaction (a closeout's, from its toast). Each is checked
 * as `event` checks it; one that is not this household's, or is undone already, refuses
 * the lot and nothing is written.
 */
export const events = mutation({
  args: { eventIds: v.array(v.id("inventoryEvents")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId, member } = await requireMember(ctx);
    if (new Set(args.eventIds).size !== args.eventIds.length) {
      throw new ConvexError(alreadyUndone);
    }
    for (const eventId of args.eventIds) {
      await undoOne(ctx, householdId, member._id, eventId);
    }
    return null;
  },
});

async function undoOne(
  ctx: MutationCtx,
  householdId: Id<"households">,
  memberId: Id<"members">,
  eventId: Id<"inventoryEvents">,
): Promise<void> {
  const target = await ctx.db.get("inventoryEvents", eventId);
  if (target === null || target.householdId !== householdId) {
    throw new ConvexError(eventNotHere);
  }
  if (target.type === "undo") {
    throw new ConvexError("That is an undo already.");
  }

  if (target.refs.cookingEventId !== undefined) {
    await undoCook(ctx, householdId, memberId, target.refs.cookingEventId);
    return;
  }
  if (await findUndo(ctx, householdId, target)) {
    throw new ConvexError(alreadyUndone);
  }

  if (target.type === "purchase" && target.refs.listItemId !== undefined) {
    const item = await ctx.db.get("listItems", target.refs.listItemId);
    if (item === null || item.householdId !== householdId) {
      throw new ConvexError(eventNotHere);
    }
    // The item's newest-inserted event must be this purchase; anything after it wins.
    const latest = await latestEvent(ctx, householdId, { listItemId: item._id });
    if (latest?._id !== target._id || item.status !== "checked") {
      throw new ConvexError("That item changed since. Undo the newer one first.");
    }
    // The list's own un-check: the pantry gives back what the check-off added.
    const ingredient =
      item.ingredientId === undefined ? null : await ctx.db.get("ingredients", item.ingredientId);
    if (ingredient !== null && ingredient.householdId === householdId) {
      await reversePurchase(
        ctx,
        { householdId, actor: { kind: "member", memberId }, item, ingredient },
        target,
      );
    }
    await ctx.db.patch("listItems", item._id, { status: "needed", checkedAt: undefined });
    return;
  }
  if (target.type === "consumption") {
    await undoConsumption(ctx, householdId, memberId, target);
    return;
  }
  if (target.type === "closeout") {
    await undoCloseout(ctx, householdId, memberId, target);
    return;
  }
  throw new ConvexError("That one cannot be undone here.");
}
