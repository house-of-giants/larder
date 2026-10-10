import { ConvexError, type Infer, type ObjectType, v } from "convex/values";
import { LOCATIONS, defaultLocation } from "../src/lib/locations";
import { parseQuantity } from "./lib/quantities";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { type Actor, type Caller, requireCaller } from "./lib/auth";
import { recordInventoryEvent } from "./lib/ledger";
import {
  type PantrySnapshot,
  findPantryRow,
  pantrySnapshot,
  requireIngredient,
} from "./lib/pantry";
import { level, pantryCount, pantryLocation as location } from "./schema";

// A shelf row joined to its ingredient: a count or a level, like the row it comes from.
const shelfRow = {
  pantryItemId: v.id("pantryItems"),
  ingredientId: v.id("ingredients"),
  name: v.string(),
  category: v.string(),
  location,
  purchaseNote: v.optional(v.string()),
  updatedAt: v.number(),
};

// Each export below is a thin wrapper: the signed-in member becomes a Caller and the
// shared function does the work. convex/agent.ts calls the same functions for the MCP door.

export const pantryRow = v.union(
  v.object({ kind: v.literal("count"), count: pantryCount, ...shelfRow }),
  v.object({ kind: v.literal("level"), level, ...shelfRow }),
);

export const list = query({
  args: {},
  returns: v.array(pantryRow),
  handler: async (ctx) => listPantry(ctx, await requireCaller(ctx)),
});

export async function listPantry(ctx: QueryCtx, { householdId }: Caller) {
  const rows = await ctx.db
    .query("pantryItems")
    .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
    .collect();
  const joined = [];
  for (const row of rows) {
    const ingredient = await ctx.db.get(row.ingredientId);
    // A row that points outside the household is corrupt; never show the other side.
    if (ingredient === null || ingredient.householdId !== householdId) {
      console.warn(`pantry.list skipped ${row._id}: its ingredient is not in the household`);
      continue;
    }
    const shelf = {
      pantryItemId: row._id,
      ingredientId: row.ingredientId,
      name: ingredient.name,
      category: ingredient.category,
      location: row.location,
      purchaseNote: row.purchaseNote,
      updatedAt: row.updatedAt,
    };
    joined.push(
      row.kind === "count"
        ? { kind: row.kind, count: row.count, ...shelf }
        : { kind: row.kind, level: row.level, ...shelf },
    );
  }
  return joined.sort(
    (a, b) =>
      LOCATIONS.indexOf(a.location) - LOCATIONS.indexOf(b.location) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

/** The row's new location and amount: a count or a level, never both. */
type RowChange = Pick<Doc<"pantryItems">, "location"> &
  (
    | { kind: "count"; count: Infer<typeof pantryCount> }
    | { kind: "level"; level: Infer<typeof level> }
  );

/**
 * Writes the row (insert, replace, or delete when `next` is null) and its ledger event in
 * the same mutation. The event's payload is the before/after snapshot undo reads back.
 */
async function writePantryRow(
  ctx: MutationCtx,
  {
    householdId,
    actor,
    ingredientId,
    existing,
    next,
  }: {
    householdId: Id<"households">;
    actor: Actor;
    ingredientId: Id<"ingredients">;
    existing: Doc<"pantryItems"> | null;
    next: RowChange | null;
  },
) {
  const updatedAt = Date.now();
  let pantryItemId: Id<"pantryItems">;
  let after: PantrySnapshot | null = null;

  if (next === null) {
    if (existing === null) return;
    pantryItemId = existing._id;
    await ctx.db.delete(existing._id);
  } else {
    // The new amount replaces the row's (a count or a level, never both). The purchase
    // note and expiry ride along from the existing row.
    after = pantrySnapshot({
      ingredientId,
      ...next,
      purchaseNote: existing?.purchaseNote,
      expiresAt: existing?.expiresAt,
    });
    const row = { householdId, ...after, updatedAt };
    if (existing === null) {
      pantryItemId = await ctx.db.insert("pantryItems", row);
    } else {
      pantryItemId = existing._id;
      await ctx.db.replace(existing._id, row);
    }
  }

  await recordInventoryEvent(ctx, {
    householdId,
    type: "adjustment",
    actor,
    refs: { pantryItemId },
    payload: { before: existing === null ? null : pantrySnapshot(existing), after },
  });
}

export const setCountArgs = {
  ingredientId: v.id("ingredients"),
  quantityText: v.string(),
  unit: v.string(),
  location: v.optional(location),
};

export const setCount = mutation({
  args: setCountArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await setPantryCount(ctx, await requireCaller(ctx), args);
    return null;
  },
});

export async function setPantryCount(
  ctx: MutationCtx,
  { householdId, actor }: Caller,
  args: ObjectType<typeof setCountArgs>,
) {
  const ingredient = await requireIngredient(ctx, householdId, args.ingredientId);
  if (ingredient.kind !== "count") {
    throw new ConvexError(`${ingredient.name} is kept as a level, not a count.`);
  }
  const quantityText = args.quantityText.trim();
  const quantityDecimal = parseQuantity(quantityText);
  if (quantityDecimal === null) {
    throw new ConvexError("Use a number or a fraction.");
  }
  const unit = args.unit.trim() || ingredient.defaultUnit;
  if (!unit) {
    throw new ConvexError("Add a unit, like each or lb.");
  }
  const existing = await findPantryRow(ctx, householdId, ingredient._id);
  await writePantryRow(ctx, {
    householdId,
    actor,
    ingredientId: ingredient._id,
    existing,
    next: {
      location: args.location ?? existing?.location ?? defaultLocation(ingredient.category),
      kind: "count",
      count: { quantityText, quantityDecimal, unit },
    },
  });
}

export const setLevelArgs = {
  ingredientId: v.id("ingredients"),
  level,
  location: v.optional(location),
};

export const setLevel = mutation({
  args: setLevelArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    await setPantryLevel(ctx, await requireCaller(ctx), args);
    return null;
  },
});

export async function setPantryLevel(
  ctx: MutationCtx,
  { householdId, actor }: Caller,
  args: ObjectType<typeof setLevelArgs>,
) {
  const ingredient = await requireIngredient(ctx, householdId, args.ingredientId);
  if (ingredient.kind !== "level") {
    throw new ConvexError(`${ingredient.name} is kept as a count, not a level.`);
  }
  const existing = await findPantryRow(ctx, householdId, ingredient._id);
  await writePantryRow(ctx, {
    householdId,
    actor,
    ingredientId: ingredient._id,
    existing,
    next: {
      location: args.location ?? existing?.location ?? defaultLocation(ingredient.category),
      kind: "level",
      level: args.level,
    },
  });
}

async function requireRow(
  ctx: MutationCtx,
  householdId: Id<"households">,
  ingredient: Doc<"ingredients">,
) {
  const existing = await findPantryRow(ctx, householdId, ingredient._id);
  if (existing === null) {
    throw new ConvexError(`${ingredient.name} is not in the pantry.`);
  }
  return existing;
}

export const markOut = mutation({
  args: { ingredientId: v.id("ingredients") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await markPantryOut(ctx, await requireCaller(ctx), args);
    return null;
  },
});

export async function markPantryOut(
  ctx: MutationCtx,
  { householdId, actor }: Caller,
  args: { ingredientId: Id<"ingredients"> },
) {
  const ingredient = await requireIngredient(ctx, householdId, args.ingredientId);
  const existing = await requireRow(ctx, householdId, ingredient);
  const next: RowChange =
    ingredient.kind === "count"
      ? {
          location: existing.location,
          kind: "count",
          count: {
            quantityText: "0",
            quantityDecimal: 0,
            unit:
              (existing.kind === "count" ? existing.count.unit : undefined) ??
              ingredient.defaultUnit ??
              "each",
          },
        }
      : { location: existing.location, kind: "level", level: "out" };
  await writePantryRow(ctx, {
    householdId,
    actor,
    ingredientId: ingredient._id,
    existing,
    next,
  });
}

export const remove = mutation({
  args: { ingredientId: v.id("ingredients") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId, actor } = await requireCaller(ctx);
    const ingredient = await requireIngredient(ctx, householdId, args.ingredientId);
    const existing = await requireRow(ctx, householdId, ingredient);
    await writePantryRow(ctx, {
      householdId,
      actor,
      ingredientId: ingredient._id,
      existing,
      next: null,
    });
    return null;
  },
});
