// Dev fixtures: the week of 2026-10-09 (seven recipes, 92 ingredients, the pantry on hand).
// Run against one dev household:
//
//   bunx convex run seed:load '{"householdId":"<id>"}'
//
// Internal only, so no client can call it, and it runs only on a deployment with
// SEED_ALLOWED=true (dev). Re-running replaces the household's kitchen data instead of
// adding to it; members and agent tokens are left alone.

import { v } from "convex/values";
import { LEVELS } from "../src/lib/levels";
import { LOCATIONS } from "../src/lib/locations";
import type { WithoutSystemFields } from "convex/server";
import { normalizeName } from "../src/lib/aliases";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { requireSeedAllowed } from "./lib/dev_only";
import { householdScopedTables } from "./lib/household";
import { recordInventoryEvent } from "./lib/ledger";
import { pantrySnapshot } from "./lib/pantry";
import ingredientFixtures from "./seed/ingredients.json";
import pantryFixtures from "./seed/pantry.json";
import recipeFixtures from "./seed/recipes.json";
import weekFixture from "./seed/week.json";

// Who belongs to the household stays; everything they keep in the kitchen goes.
const keptTables = new Set(["members", "householdTokens"]);
const wipedTables = householdScopedTables.filter((table) => !keptTables.has(table));

/** Narrows a fixture string to the schema's union, failing loudly on a typo. */
function oneOf<const T extends string>(value: string, allowed: readonly T[]): T {
  if (!(allowed as readonly string[]).includes(value)) {
    throw new Error(`Seed value "${value}" is not one of ${allowed.join(", ")}`);
  }
  return value as T;
}

/** JSON nulls become absent fields. */
function present<T>(value: T | null | undefined): T | undefined {
  return value ?? undefined;
}

export const load = internalMutation({
  args: { householdId: v.id("households") },
  returns: v.object({
    ingredients: v.number(),
    recipes: v.number(),
    recipeIngredients: v.number(),
    pantryItems: v.number(),
    weekRecipes: v.number(),
    weekAdaptations: v.number(),
    inventoryEvents: v.number(),
  }),
  handler: async (ctx, { householdId }) => {
    requireSeedAllowed();
    if ((await ctx.db.get(householdId)) === null) {
      throw new Error("No household with that id.");
    }
    const members = await ctx.db
      .query("members")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    const firstMember = members.sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (firstMember === undefined) {
      throw new Error("Seed needs a household with at least one member.");
    }

    for (const table of wipedTables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .collect();
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
    }

    const now = Date.now();

    const ingredientIds = new Map<string, Id<"ingredients">>();
    for (const i of ingredientFixtures) {
      const id = await ctx.db.insert("ingredients", {
        householdId,
        name: i.name,
        nameKey: normalizeName(i.name),
        kind: oneOf(i.kind, ["count", "level"]),
        category: i.category,
        defaultUnit: present(i.defaultUnit),
        aliases: i.aliases,
        tracked: i.tracked,
        needsReview: false,
      });
      ingredientIds.set(i.name, id);
    }
    const ingredientId = (name: string) => {
      const id = ingredientIds.get(name);
      if (id === undefined) throw new Error(`Seed names an unknown ingredient: ${name}`);
      return id;
    };

    const recipeIds = new Map<string, Id<"recipes">>();
    let recipeIngredients = 0;
    for (const r of recipeFixtures) {
      const recipeId = await ctx.db.insert("recipes", {
        householdId,
        name: r.name,
        source: {
          type: r.source.type,
          title: present(r.source.title),
          url: present(r.source.url),
          date: present(r.source.date),
        },
        yield: {
          quantityText: r.yield.quantityText,
          quantityDecimal: present(r.yield.quantityDecimal),
          unit: r.yield.unit,
        },
        freezerFriendly: r.freezerFriendly,
        storageNotes: present(r.storageNotes),
        reheatingNotes: present(r.reheatingNotes),
        instructions: r.instructions,
        tags: r.tags,
        needsReview: r.needsReview,
        updatedAt: now,
      });
      recipeIds.set(r.name, recipeId);
      for (const row of r.ingredients) {
        await ctx.db.insert("recipeIngredients", {
          householdId,
          recipeId,
          order: row.order,
          ingredientId: ingredientId(row.ingredient),
          displayName: row.displayName,
          quantityText: row.quantityText,
          quantityDecimal: present(row.quantityDecimal),
          unit: row.unit,
          optional: row.optional,
          preparation: present(row.preparation),
          needsReview: row.needsReview,
        });
        recipeIngredients += 1;
      }
    }
    const recipeId = (name: string) => {
      const id = recipeIds.get(name);
      if (id === undefined) throw new Error(`Seed names an unknown recipe: ${name}`);
      return id;
    };

    for (const p of pantryFixtures) {
      const common = {
        householdId,
        ingredientId: ingredientId(p.ingredient),
        location: oneOf(p.location, LOCATIONS),
        purchaseNote: present(p.purchaseNote),
        updatedAt: now,
      };
      // A fixture row is a count or a level, like the table.
      const row: WithoutSystemFields<Doc<"pantryItems">> =
        p.count !== undefined
          ? { kind: "count", count: p.count, ...common }
          : { kind: "level", level: oneOf(p.level ?? "", LEVELS), ...common };
      const pantryItemId = await ctx.db.insert("pantryItems", row);
      await recordInventoryEvent(ctx, {
        householdId,
        type: "purchase",
        actor: { kind: "member", memberId: firstMember._id },
        refs: { pantryItemId },
        payload: { before: null, after: pantrySnapshot(row) },
      });
    }

    const weekId = await ctx.db.insert("weeks", {
      householdId,
      weekOf: weekFixture.weekOf,
      status: oneOf(weekFixture.status, ["planning", "shopping", "cooking", "active", "closed"]),
      sourceUrls: weekFixture.sourceUrls,
      createdAt: now,
    });
    for (const w of weekFixture.recipes) {
      await ctx.db.insert("weekRecipes", {
        householdId,
        weekId,
        recipeId: recipeId(w.recipe),
        status: oneOf(w.status, ["candidate", "selected", "skipped"]),
        multiplier: w.multiplier,
      });
    }
    for (const a of weekFixture.adaptations) {
      await ctx.db.insert("weekAdaptations", {
        householdId,
        weekId,
        recipeId: recipeId(a.recipe),
        kind: oneOf(a.kind, ["replace", "add", "remove", "adjust"]),
        description: a.description,
        originalIngredientId: ingredientId(a.originalIngredient),
        newIngredientId: ingredientId(a.newIngredient),
        quantityText: a.quantityText,
        quantityDecimal: a.quantityDecimal,
        unit: a.unit,
      });
    }

    return {
      ingredients: ingredientFixtures.length,
      recipes: recipeFixtures.length,
      recipeIngredients,
      pantryItems: pantryFixtures.length,
      weekRecipes: weekFixture.recipes.length,
      weekAdaptations: weekFixture.adaptations.length,
      inventoryEvents: pantryFixtures.length,
    };
  },
});
