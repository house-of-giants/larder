import { ConvexError, v } from "convex/values";
import { LOCATIONS, defaultLocation } from "../src/lib/locations";
import { parseQuantity } from "../src/lib/quantities";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { recordInventoryEvent } from "./lib/ledger";
import {
  type PantrySnapshot,
  findPantryRow,
  pantrySnapshot,
  requireIngredient,
} from "./lib/pantry";
import schema, { level } from "./schema";

const pantryFields = schema.tables.pantryItems.validator.fields;
const location = pantryFields.location;

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      pantryItemId: v.id("pantryItems"),
      ingredientId: v.id("ingredients"),
      name: v.string(),
      kind: schema.tables.ingredients.validator.fields.kind,
      category: v.string(),
      location,
      count: pantryFields.count,
      level: pantryFields.level,
      purchaseNote: v.optional(v.string()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const { householdId } = await requireMember(ctx);
    const rows = await ctx.db
      .query("pantryItems")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    const joined = [];
    for (const row of rows) {
      const ingredient = await ctx.db.get(row.ingredientId);
      if (ingredient === null) continue;
      joined.push({
        pantryItemId: row._id,
        ingredientId: row.ingredientId,
        name: ingredient.name,
        kind: ingredient.kind,
        category: ingredient.category,
        location: row.location,
        count: row.count,
        level: row.level,
        purchaseNote: row.purchaseNote,
        updatedAt: row.updatedAt,
      });
    }
    return joined.sort(
      (a, b) =>
        LOCATIONS.indexOf(a.location) - LOCATIONS.indexOf(b.location) ||
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  },
});

type RowChange = Pick<Doc<"pantryItems">, "location" | "count" | "level">;

/**
 * Writes the row (insert, replace, or delete when `next` is null) and its ledger event in
 * the same mutation. The event's payload is the before/after snapshot undo reads back.
 */
async function writePantryRow(
  ctx: MutationCtx,
  {
    householdId,
    memberId,
    ingredientId,
    existing,
    next,
  }: {
    householdId: Id<"households">;
    memberId: Id<"members">;
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
    // Counts and levels never share a row; whichever was set before is dropped. The
    // purchase note and expiry ride along from the existing row.
    after = pantrySnapshot({
      ingredientId,
      location: next.location,
      count: next.count,
      level: next.level,
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
    actor: { kind: "member", memberId },
    refs: { pantryItemId },
    payload: { before: existing === null ? null : pantrySnapshot(existing), after },
  });
}

export const setCount = mutation({
  args: {
    ingredientId: v.id("ingredients"),
    quantityText: v.string(),
    unit: v.string(),
    location: v.optional(location),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId, member } = await requireMember(ctx);
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
      memberId: member._id,
      ingredientId: ingredient._id,
      existing,
      next: {
        location: args.location ?? existing?.location ?? defaultLocation(ingredient.category),
        count: { quantityText, quantityDecimal, unit },
      },
    });
    return null;
  },
});

export const setLevel = mutation({
  args: { ingredientId: v.id("ingredients"), level, location: v.optional(location) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId, member } = await requireMember(ctx);
    const ingredient = await requireIngredient(ctx, householdId, args.ingredientId);
    if (ingredient.kind !== "level") {
      throw new ConvexError(`${ingredient.name} is kept as a count, not a level.`);
    }
    const existing = await findPantryRow(ctx, householdId, ingredient._id);
    await writePantryRow(ctx, {
      householdId,
      memberId: member._id,
      ingredientId: ingredient._id,
      existing,
      next: {
        location: args.location ?? existing?.location ?? defaultLocation(ingredient.category),
        level: args.level,
      },
    });
    return null;
  },
});

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
    const { householdId, member } = await requireMember(ctx);
    const ingredient = await requireIngredient(ctx, householdId, args.ingredientId);
    const existing = await requireRow(ctx, householdId, ingredient);
    const next: RowChange =
      ingredient.kind === "count"
        ? {
            location: existing.location,
            count: {
              quantityText: "0",
              quantityDecimal: 0,
              unit: existing.count?.unit ?? ingredient.defaultUnit ?? "each",
            },
          }
        : { location: existing.location, level: "out" };
    await writePantryRow(ctx, {
      householdId,
      memberId: member._id,
      ingredientId: ingredient._id,
      existing,
      next,
    });
    return null;
  },
});

export const remove = mutation({
  args: { ingredientId: v.id("ingredients") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId, member } = await requireMember(ctx);
    const ingredient = await requireIngredient(ctx, householdId, args.ingredientId);
    const existing = await requireRow(ctx, householdId, ingredient);
    await writePantryRow(ctx, {
      householdId,
      memberId: member._id,
      ingredientId: ingredient._id,
      existing,
      next: null,
    });
    return null;
  },
});
