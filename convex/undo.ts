import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx, mutation, query } from "./_generated/server";
import { reversePurchase } from "./lists";
import { amountWords } from "./lib/amounts";
import { requireMember } from "./lib/auth";
import type { PantrySnapshot } from "./lib/pantry";
import type { FoodPayload } from "./lib/prepared_food";
import {
  type CloseoutPayload,
  type ConsumptionPayload,
  alreadyUndone,
  findUndo,
  undoCloseout,
  undoConsumption,
  undoCook,
} from "./lib/reversals";
import schema from "./schema";

// The undo drawer: the household's latest inventory events in plain lines, and one way to
// reverse the ones people take back (a check-off, a cook, a portion eaten, a closeout).
// Every reversal writes `undo` events; the original events stay.

const eventNotHere = "That event is not here.";
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
    ingredient: (id: Id<"ingredients"> | undefined) => cached<"ingredients">(id, (r) => r.name),
    recipe: (id: Id<"recipes"> | undefined) => cached<"recipes">(id, (r) => r.name),
    listItem: (id: Id<"listItems"> | undefined) => cached<"listItems">(id, (r) => r.displayName),
  };
}
type Namer = ReturnType<typeof namer>;

async function cookLine(ctx: QueryCtx, names: Namer, cookingEventId: Id<"cookingEvents">) {
  const cook = await ctx.db.get("cookingEvents", cookingEventId);
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
      isCook: boolean;
    };
    const rows: Row[] = [];
    // Newest first, so an event's undo (always newer) and anything newer on the same list
    // item are seen before the event itself.
    const undone = new Set<Id<"inventoryEvents">>();
    const newerOnItem = new Set<Id<"listItems">>();
    const cookRows = new Set<string>();
    let scanned = 0;

    for await (const event of ctx.db
      .query("inventoryEvents")
      .withIndex("by_householdId_at", (q) => q.eq("householdId", householdId))
      .order("desc")) {
      if (rows.length >= limit || scanned >= scanLimit) break;
      scanned += 1;
      const { listItemId, cookingEventId } = event.refs;

      if (cookingEventId !== undefined) {
        // A cook's deductions and its leftovers read as one line, and so does their undo.
        const key = `${cookingEventId}:${event.type === "undo" ? "undo" : "cook"}`;
        if (!cookRows.has(key)) {
          cookRows.add(key);
          const { cook, line } = await cookLine(ctx, names, cookingEventId);
          const isUndo = event.type === "undo";
          rows.push({
            eventId: event._id,
            at: event.at,
            type: event.type,
            line: isUndo ? `Undone: ${line}` : line,
            canUndo: !isUndo && cook !== null && cook.undoneAt === undefined,
            isCook: !isUndo,
          });
        }
      } else {
        let canUndo = false;
        if (event.type === "purchase" && listItemId !== undefined) {
          canUndo = !undone.has(event._id) && !newerOnItem.has(listItemId);
        } else if (event.type === "consumption" || event.type === "closeout") {
          canUndo = !undone.has(event._id);
        }
        rows.push({
          eventId: event._id,
          at: event.at,
          type: event.type,
          line: await lineOf(ctx, names, event),
          canUndo,
          isCook: false,
        });
      }

      if (event.undoesEventId !== undefined) undone.add(event.undoesEventId);
      if (listItemId !== undefined) newerOnItem.add(listItemId);
    }
    return rows;
  },
});

/** The list item's newest event, newest first from `since`. */
async function latestOnItem(
  ctx: QueryCtx,
  householdId: Id<"households">,
  listItemId: Id<"listItems">,
  since: number,
) {
  for await (const event of ctx.db
    .query("inventoryEvents")
    .withIndex("by_householdId_at", (q) => q.eq("householdId", householdId).gte("at", since))
    .order("desc")) {
    if (event.refs.listItemId === listItemId) return event;
  }
  return null;
}

export const event = mutation({
  args: { eventId: v.id("inventoryEvents") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId, member } = await requireMember(ctx);
    const target = await ctx.db.get("inventoryEvents", args.eventId);
    if (target === null || target.householdId !== householdId) {
      throw new ConvexError(eventNotHere);
    }
    if (target.type === "undo") {
      throw new ConvexError("That is an undo already.");
    }

    if (target.refs.cookingEventId !== undefined) {
      await undoCook(ctx, householdId, member._id, target.refs.cookingEventId);
      return null;
    }
    if (await findUndo(ctx, householdId, target)) {
      throw new ConvexError(alreadyUndone);
    }

    if (target.type === "purchase" && target.refs.listItemId !== undefined) {
      const item = await ctx.db.get("listItems", target.refs.listItemId);
      if (item === null || item.householdId !== householdId) {
        throw new ConvexError(eventNotHere);
      }
      const latest = await latestOnItem(ctx, householdId, item._id, target.at);
      if (latest?._id !== target._id || item.status !== "checked") {
        throw new ConvexError("That item changed since. Undo the newer one first.");
      }
      // The list's own un-check: the pantry gives back what the check-off added.
      const ingredient =
        item.ingredientId === undefined ? null : await ctx.db.get("ingredients", item.ingredientId);
      if (ingredient !== null && ingredient.householdId === householdId) {
        await reversePurchase(ctx, { householdId, memberId: member._id, item, ingredient });
      }
      await ctx.db.patch("listItems", item._id, { status: "needed", checkedAt: undefined });
      return null;
    }
    if (target.type === "consumption") {
      await undoConsumption(ctx, householdId, member._id, target);
      return null;
    }
    if (target.type === "closeout") {
      await undoCloseout(ctx, householdId, member._id, target);
      return null;
    }
    throw new ConvexError("That one cannot be undone here.");
  },
});
