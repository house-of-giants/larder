import { ConvexError, v } from "convex/values";
import { defaultLocation } from "../src/lib/locations";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { recordInventoryEvent } from "./lib/ledger";
import {
  type ListAdaptation,
  type ListIngredient,
  type ListPantryRow,
  type ListRecipe,
  STORE_SECTIONS,
  generateList,
} from "./lib/list_generation";
import { type PantrySnapshot, findPantryRow, pantrySnapshot } from "./lib/pantry";
import { formatQuantity, parseQuantity } from "./lib/quantities";
import { findOpenWeek, requireWeek, weekRows } from "./lib/weeks";
import schema from "./schema";

// The week's shopping list. Plan items come from lists.generate; ad-hoc items are typed in
// the store and never touch the pantry or the ledger. Checking off a plan item puts it in
// the pantry (counts add in the same unit, levels go to full) and records a purchase event
// in the same mutation; un-checking reverses it with an undo event.

const itemFields = schema.tables.listItems.validator.fields;
const itemNotHere = "That item is not on your list.";

function sectionRank(category: string): number {
  const index = (STORE_SECTIONS as readonly string[]).indexOf(category);
  return index === -1 ? STORE_SECTIONS.length : index;
}

const byText = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

/** The week's active list, if it has one. */
async function activeList(
  ctx: QueryCtx,
  householdId: Id<"households">,
  weekId: Id<"weeks">,
): Promise<Doc<"lists"> | null> {
  const lists = await weekRows(ctx, "lists", householdId, weekId);
  return (
    lists.filter((l) => l.status === "active").sort((a, b) => b.generatedAt - a.generatedAt)[0] ??
    null
  );
}

async function listItemsOf(ctx: QueryCtx, householdId: Id<"households">, listId: Id<"lists">) {
  const rows = await ctx.db
    .query("listItems")
    .withIndex("by_listId", (q) => q.eq("listId", listId))
    .collect();
  return rows.filter((r) => r.householdId === householdId);
}

const planKey = (ingredientId: Id<"ingredients"> | undefined, unit: string) =>
  JSON.stringify([ingredientId ?? null, unit]);

export const generate = mutation({
  args: { weekId: v.id("weeks") },
  returns: v.id("lists"),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const week = await requireWeek(ctx, householdId, args.weekId);
    if (week.status !== "planning" && week.status !== "shopping") {
      throw new ConvexError("The list is set for this week.");
    }

    // Every joined row is checked against the household before it is used.
    const recipes: ListRecipe<Id<"ingredients">, Id<"recipes">>[] = [];
    const weekRecipes = await weekRows(ctx, "weekRecipes", householdId, week._id);
    for (const wr of weekRecipes) {
      if (wr.status !== "selected") continue;
      const recipe = await ctx.db.get("recipes", wr.recipeId);
      if (recipe === null || recipe.householdId !== householdId) continue;
      const rows = await ctx.db
        .query("recipeIngredients")
        .withIndex("by_recipeId", (q) => q.eq("recipeId", recipe._id))
        .collect();
      recipes.push({
        recipeId: recipe._id,
        name: recipe.name,
        multiplier: wr.multiplier.decimal,
        ingredients: rows
          .filter((r) => r.householdId === householdId)
          .sort((a, b) => a.order - b.order)
          .map((r) => ({
            ingredientId: r.ingredientId,
            quantityDecimal: r.quantityDecimal ?? null,
            quantityText: r.quantityText,
            unit: r.unit,
          })),
      });
    }
    if (recipes.length === 0) {
      throw new ConvexError("Pick at least one recipe first.");
    }

    const adaptations: ListAdaptation<Id<"ingredients">, Id<"recipes">>[] = (
      await weekRows(ctx, "weekAdaptations", householdId, week._id)
    ).map((a) => ({
      recipeId: a.recipeId,
      kind: a.kind,
      originalIngredientId: a.originalIngredientId,
      newIngredientId: a.newIngredientId,
      quantityDecimal: a.quantityDecimal,
      quantityText: a.quantityText,
      unit: a.unit,
    }));

    const ingredientRows = await ctx.db
      .query("ingredients")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    const ingredients = new Map<Id<"ingredients">, ListIngredient>(
      ingredientRows.map((i) => [
        i._id,
        { name: i.name, kind: i.kind, category: i.category, tracked: i.tracked },
      ]),
    );
    // A row naming an ingredient from outside the household is dropped, not trusted.
    for (const recipe of recipes) {
      recipe.ingredients = recipe.ingredients.filter((r) => ingredients.has(r.ingredientId));
    }
    const ownAdaptations = adaptations.filter(
      (a) =>
        (a.originalIngredientId === undefined || ingredients.has(a.originalIngredientId)) &&
        (a.newIngredientId === undefined || ingredients.has(a.newIngredientId)),
    );

    const pantryRows = await ctx.db
      .query("pantryItems")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    const pantry = new Map<Id<"ingredients">, ListPantryRow>(
      pantryRows.map((p) => [p.ingredientId, { count: p.count, level: p.level }]),
    );

    const { items } = generateList({
      recipes,
      adaptations: ownAdaptations,
      ingredients,
      pantry,
    });

    const now = Date.now();
    let list = await activeList(ctx, householdId, week._id);
    if (list === null) {
      const listId = await ctx.db.insert("lists", {
        householdId,
        weekId: week._id,
        status: "active",
        generatedAt: now,
      });
      list = (await ctx.db.get("lists", listId))!;
    } else {
      await ctx.db.patch("lists", list._id, { generatedAt: now });
    }

    // Re-running keeps ad-hoc items, and keeps a plan line's row (and so its check-off and
    // the ledger events that point at it) when the same ingredient and unit come back.
    const previous = new Map<string, Doc<"listItems">>();
    for (const item of await listItemsOf(ctx, householdId, list._id)) {
      if (item.source !== "plan") continue;
      const key = planKey(item.ingredientId, item.required.unit);
      if (previous.has(key)) {
        await ctx.db.delete("listItems", item._id);
      } else {
        previous.set(key, item);
      }
    }

    for (const line of items) {
      const fields = {
        displayName: line.displayName,
        category: line.category,
        required: line.required,
        purchase: line.purchase,
        sourceRecipeIds: line.sourceRecipeIds,
      };
      const key = planKey(line.ingredientId, line.required.unit);
      const kept = previous.get(key);
      if (kept !== undefined) {
        previous.delete(key);
        const decided = kept.status === "checked" || kept.status === "skipped";
        await ctx.db.patch("listItems", kept._id, {
          ...fields,
          status: decided ? kept.status : line.status,
        });
        continue;
      }
      await ctx.db.insert("listItems", {
        householdId,
        listId: list._id,
        source: "plan",
        ingredientId: line.ingredientId,
        ...fields,
        status: line.status,
      });
    }
    for (const stale of previous.values()) {
      await ctx.db.delete("listItems", stale._id);
    }

    if (week.status === "planning") {
      await ctx.db.patch("weeks", week._id, { status: "shopping" });
    }
    return list._id;
  },
});

const listItemView = v.object({
  _id: v.id("listItems"),
  source: itemFields.source,
  ingredientId: itemFields.ingredientId,
  displayName: v.string(),
  category: v.string(),
  kind: v.union(v.literal("count"), v.literal("level")),
  required: itemFields.required,
  purchase: itemFields.purchase,
  status: itemFields.status,
  checkedAt: itemFields.checkedAt,
  sourceRecipeIds: itemFields.sourceRecipeIds,
});

export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      listId: v.id("lists"),
      weekId: v.id("weeks"),
      weekOf: v.string(),
      status: v.union(v.literal("draft"), v.literal("active"), v.literal("complete")),
      generatedAt: v.number(),
      sections: v.array(v.object({ category: v.string(), items: v.array(listItemView) })),
    }),
  ),
  handler: async (ctx) => {
    const { householdId } = await requireMember(ctx);
    const week = await findOpenWeek(ctx, householdId);
    if (week === null) return null;
    const list = await activeList(ctx, householdId, week._id);
    if (list === null) return null;

    const items = [];
    for (const item of await listItemsOf(ctx, householdId, list._id)) {
      let kind: "count" | "level" = "count";
      if (item.ingredientId !== undefined) {
        const ingredient = await ctx.db.get("ingredients", item.ingredientId);
        if (ingredient === null || ingredient.householdId !== householdId) continue;
        kind = ingredient.kind;
      }
      items.push({
        _id: item._id,
        source: item.source,
        ingredientId: item.ingredientId,
        displayName: item.displayName,
        category: item.category,
        kind,
        required: item.required,
        purchase: item.purchase,
        status: item.status,
        checkedAt: item.checkedAt,
        sourceRecipeIds: item.sourceRecipeIds,
      });
    }
    // Store order, then what is left to buy before what is already home, then by name.
    items.sort(
      (a, b) =>
        sectionRank(a.category) - sectionRank(b.category) ||
        byText(a.category, b.category) ||
        Number(a.status === "onHand") - Number(b.status === "onHand") ||
        byText(a.displayName, b.displayName) ||
        byText(a.required.unit, b.required.unit),
    );
    const sections: { category: string; items: typeof items }[] = [];
    for (const item of items) {
      const last = sections.at(-1);
      if (last?.category === item.category) last.items.push(item);
      else sections.push({ category: item.category, items: [item] });
    }
    return {
      listId: list._id,
      weekId: week._id,
      weekOf: week.weekOf,
      status: list.status,
      generatedAt: list.generatedAt,
      sections,
    };
  },
});

function optionalText(raw: string | undefined): string | undefined {
  const text = raw?.trim();
  return text ? text : undefined;
}

export const addItem = mutation({
  args: {
    displayName: v.string(),
    quantityText: v.optional(v.string()),
    unit: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  returns: v.id("listItems"),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const displayName = args.displayName.trim().replace(/\s+/g, " ");
    if (displayName === "") {
      throw new ConvexError("Name the item.");
    }
    const week = await findOpenWeek(ctx, householdId);
    const list = week === null ? null : await activeList(ctx, householdId, week._id);
    if (list === null) {
      throw new ConvexError("Make the list first.");
    }
    const quantityText = optionalText(args.quantityText) ?? "";
    const quantityDecimal = parseQuantity(quantityText) ?? undefined;
    return await ctx.db.insert("listItems", {
      householdId,
      listId: list._id,
      source: "adhoc",
      displayName,
      category: optionalText(args.category) ?? "other",
      required: { quantityText, quantityDecimal, unit: optionalText(args.unit) ?? "" },
      status: "needed",
      sourceRecipeIds: [],
    });
  },
});

type PurchasePayload = {
  before: PantrySnapshot | null;
  after: PantrySnapshot;
  /** The amount added to a same-unit count; absent when the row was set outright. */
  added?: { quantityDecimal: number; unit: string };
  /** A count in another unit that the purchase replaced (no unit conversion). */
  replacedCount?: { quantityText: string; quantityDecimal: number; unit: string };
};

/** Writes the pantry row to `after` (or deletes it when null) and stamps updatedAt. */
async function putPantryRow(
  ctx: MutationCtx,
  householdId: Id<"households">,
  existing: Doc<"pantryItems"> | null,
  after: PantrySnapshot | null,
): Promise<Id<"pantryItems"> | undefined> {
  if (after === null) {
    if (existing !== null) await ctx.db.delete("pantryItems", existing._id);
    return existing?._id;
  }
  const row = { householdId, ...after, updatedAt: Date.now() };
  if (existing === null) return await ctx.db.insert("pantryItems", row);
  await ctx.db.replace("pantryItems", existing._id, row);
  return existing._id;
}

/** Check-off of a plan item: the pantry gains what was bought, with a purchase event. */
async function applyPurchase(
  ctx: MutationCtx,
  householdId: Id<"households">,
  memberId: Id<"members">,
  item: Doc<"listItems">,
  ingredient: Doc<"ingredients">,
) {
  const existing = await findPantryRow(ctx, householdId, ingredient._id);
  const location = existing?.location ?? defaultLocation(ingredient.category);
  const kept = {
    ingredientId: ingredient._id,
    location,
    purchaseNote: existing?.purchaseNote,
    expiresAt: existing?.expiresAt,
  };
  const payload: Omit<PurchasePayload, "after"> = {
    before: existing === null ? null : pantrySnapshot(existing),
  };
  let after: PantrySnapshot;

  if (ingredient.kind === "level") {
    after = pantrySnapshot({ ...kept, level: "full" });
  } else {
    // What was bought: the purchase, or the required amount when nothing was left to buy.
    const purchase = item.purchase;
    const bought =
      purchase?.quantityDecimal !== undefined && purchase.quantityDecimal > 0
        ? { quantityDecimal: purchase.quantityDecimal, unit: purchase.unit }
        : item.required.quantityDecimal !== undefined
          ? { quantityDecimal: item.required.quantityDecimal, unit: item.required.unit }
          : null;
    // "As needed" has no number to add; the item is checked and the pantry left alone.
    if (bought === null) return;
    const unit = bought.unit.trim();
    const count = existing?.count;
    if (count !== undefined && count.unit.trim() === unit) {
      const total = count.quantityDecimal + bought.quantityDecimal;
      after = pantrySnapshot({
        ...kept,
        count: { quantityText: formatQuantity(total), quantityDecimal: total, unit },
      });
      payload.added = { quantityDecimal: bought.quantityDecimal, unit };
    } else {
      after = pantrySnapshot({
        ...kept,
        count: {
          quantityText: formatQuantity(bought.quantityDecimal),
          quantityDecimal: bought.quantityDecimal,
          unit,
        },
      });
      if (count !== undefined) payload.replacedCount = count;
    }
  }

  const pantryItemId = await putPantryRow(ctx, householdId, existing, after);
  await recordInventoryEvent(ctx, {
    householdId,
    type: "purchase",
    actor: { kind: "member", memberId },
    refs: { pantryItemId, listItemId: item._id },
    payload: { ...payload, after } satisfies PurchasePayload,
  });
}

/** Un-check of a plan item: reverses its latest purchase event, if it has one standing. */
async function reversePurchase(
  ctx: MutationCtx,
  householdId: Id<"households">,
  memberId: Id<"members">,
  item: Doc<"listItems">,
  ingredient: Doc<"ingredients">,
) {
  // Newest first, reading only as far back as this item's last event.
  let latest: Doc<"inventoryEvents"> | undefined;
  for await (const event of ctx.db
    .query("inventoryEvents")
    .withIndex("by_householdId_at", (q) => q.eq("householdId", householdId))
    .order("desc")) {
    if (event.refs.listItemId === item._id) {
      latest = event;
      break;
    }
  }
  if (latest === undefined || latest.type !== "purchase") return;
  const payload = latest.payload as PurchasePayload;

  const existing = await findPantryRow(ctx, householdId, ingredient._id);
  let restored: PantrySnapshot | null;
  const count = existing?.count;
  if (
    existing !== null &&
    payload.added !== undefined &&
    count !== undefined &&
    count.unit.trim() === payload.added.unit
  ) {
    // Take back only what the check-off added, so edits made since are kept.
    const total = Math.max(0, count.quantityDecimal - payload.added.quantityDecimal);
    restored = pantrySnapshot({
      ...existing,
      count: { quantityText: formatQuantity(total), quantityDecimal: total, unit: count.unit },
    });
  } else {
    restored = payload.before;
  }

  const pantryItemId = await putPantryRow(ctx, householdId, existing, restored);
  await recordInventoryEvent(ctx, {
    householdId,
    type: "undo",
    actor: { kind: "member", memberId },
    refs: { pantryItemId, listItemId: item._id },
    payload: { before: existing === null ? null : pantrySnapshot(existing), after: restored },
    undoesEventId: latest._id,
  });
}

export const setItemStatus = mutation({
  args: {
    listItemId: v.id("listItems"),
    status: v.union(v.literal("needed"), v.literal("checked"), v.literal("skipped")),
    /** When the phone recorded the tap; offline check-offs replay later. */
    at: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId, member } = await requireMember(ctx);
    const item = await ctx.db.get("listItems", args.listItemId);
    if (item === null || item.householdId !== householdId) {
      throw new ConvexError(itemNotHere);
    }
    const list = await ctx.db.get("lists", item.listId);
    if (list === null || list.householdId !== householdId) {
      throw new ConvexError(itemNotHere);
    }
    // Idempotent: a replayed tap that is already in place changes nothing.
    if (item.status === args.status) return null;

    if (item.source === "plan" && item.ingredientId !== undefined) {
      const ingredient = await ctx.db.get("ingredients", item.ingredientId);
      if (ingredient === null || ingredient.householdId !== householdId) {
        throw new ConvexError(itemNotHere);
      }
      if (args.status === "checked") {
        await applyPurchase(ctx, householdId, member._id, item, ingredient);
      } else if (item.status === "checked") {
        await reversePurchase(ctx, householdId, member._id, item, ingredient);
      }
    }

    await ctx.db.patch("listItems", item._id, {
      status: args.status,
      checkedAt: args.status === "checked" ? (args.at ?? Date.now()) : undefined,
    });
    return null;
  },
});

export const reconcileItems = query({
  args: { weekId: v.id("weeks") },
  returns: v.array(
    v.object({
      ingredientId: v.id("ingredients"),
      name: v.string(),
      kind: v.union(v.literal("count"), v.literal("level")),
      category: v.string(),
      defaultUnit: v.optional(v.string()),
      count: schema.tables.pantryItems.validator.fields.count,
      level: schema.tables.pantryItems.validator.fields.level,
      required: v.array(v.object({ quantityText: v.string(), unit: v.string() })),
    }),
  ),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const week = await requireWeek(ctx, householdId, args.weekId);
    const list = await activeList(ctx, householdId, week._id);
    if (list === null) return [];

    const byIngredient = new Map<Id<"ingredients">, { quantityText: string; unit: string }[]>();
    for (const item of await listItemsOf(ctx, householdId, list._id)) {
      if (item.source !== "plan" || item.ingredientId === undefined) continue;
      const required = byIngredient.get(item.ingredientId) ?? [];
      required.push({ quantityText: item.required.quantityText, unit: item.required.unit });
      byIngredient.set(item.ingredientId, required);
    }

    const rows = [];
    for (const [ingredientId, required] of byIngredient) {
      const ingredient = await ctx.db.get("ingredients", ingredientId);
      if (ingredient === null || ingredient.householdId !== householdId) continue;
      const pantry = await findPantryRow(ctx, householdId, ingredientId);
      rows.push({
        ingredientId,
        name: ingredient.name,
        kind: ingredient.kind,
        category: ingredient.category,
        defaultUnit: ingredient.defaultUnit,
        count: pantry?.count,
        level: pantry?.level,
        required: required.sort((a, b) => byText(a.unit, b.unit)),
      });
    }
    return rows.sort(
      (a, b) =>
        sectionRank(a.category) - sectionRank(b.category) ||
        byText(a.category, b.category) ||
        byText(a.name, b.name),
    );
  },
});
