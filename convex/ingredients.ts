import { ConvexError, v } from "convex/values";
import { normalizeName, resolveIngredient } from "../src/lib/aliases";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireMember } from "./lib/auth";
import { findPantryRow, requireIngredient } from "./lib/pantry";
import schema from "./schema";

const ingredientDoc = v.object({
  _id: v.id("ingredients"),
  _creationTime: v.number(),
  ...schema.tables.ingredients.validator.fields,
});

const byName = (a: Doc<"ingredients">, b: Doc<"ingredients">) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export const list = query({
  args: {},
  returns: v.array(ingredientDoc),
  handler: async (ctx) => {
    const { householdId } = await requireMember(ctx);
    const rows = await ctx.db
      .query("ingredients")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    return rows.sort(byName);
  },
});

export const get = query({
  args: { id: v.id("ingredients") },
  returns: v.union(v.null(), ingredientDoc),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const ingredient = await ctx.db.get(args.id);
    return ingredient?.householdId === householdId ? ingredient : null;
  },
});

/** Trimmed, blanks dropped, one per normalized spelling, none that repeat the name. */
function cleanAliases(name: string, aliases: string[]): string[] {
  const seen = new Set([normalizeName(name)]);
  const kept: string[] = [];
  for (const raw of aliases) {
    const alias = raw.trim().replace(/\s+/g, " ");
    const key = normalizeName(alias);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    kept.push(alias);
  }
  return kept;
}

function optionalText(raw: string | undefined): string | undefined {
  const text = raw?.trim();
  return text === "" ? undefined : text;
}

export const upsert = mutation({
  args: {
    id: v.optional(v.id("ingredients")),
    name: v.string(),
    kind: schema.tables.ingredients.validator.fields.kind,
    category: v.string(),
    defaultUnit: v.optional(v.string()),
    aliases: v.array(v.string()),
    tracked: v.boolean(),
    notes: v.optional(v.string()),
  },
  returns: v.id("ingredients"),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const name = args.name.trim().replace(/\s+/g, " ");
    if (name === "") {
      throw new ConvexError("Give the ingredient a name.");
    }
    const category = args.category.trim();
    if (category === "") {
      throw new ConvexError("Pick a category.");
    }

    const existing =
      args.id === undefined ? null : await requireIngredient(ctx, householdId, args.id);

    const nameKey = normalizeName(name);
    const sameName = await ctx.db
      .query("ingredients")
      .withIndex("by_householdId_nameKey", (q) =>
        q.eq("householdId", householdId).eq("nameKey", nameKey),
      )
      .collect();
    const taken = sameName.find((i) => i._id !== existing?._id);
    if (taken) {
      throw new ConvexError(`${taken.name} is already in the list.`);
    }

    if (existing !== null && existing.kind !== args.kind) {
      if ((await findPantryRow(ctx, householdId, existing._id)) !== null) {
        throw new ConvexError("Clear the pantry row first.");
      }
    }

    const fields = {
      name,
      nameKey,
      kind: args.kind,
      category,
      defaultUnit: optionalText(args.defaultUnit),
      aliases: cleanAliases(name, args.aliases),
      tracked: args.tracked,
      notes: optionalText(args.notes),
    };

    if (existing === null) {
      // Typed by a person, so nothing to review.
      return await ctx.db.insert("ingredients", { householdId, needsReview: false, ...fields });
    }
    // patch removes fields set to undefined, so clearing a unit or note sticks.
    await ctx.db.patch(existing._id, fields);
    return existing._id;
  },
});

export const resolve = query({
  args: { name: v.string() },
  returns: v.union(
    v.object({
      kind: v.literal("match"),
      ingredientId: v.id("ingredients"),
      name: v.string(),
      how: v.union(v.literal("exact"), v.literal("case"), v.literal("alias"), v.literal("plural")),
    }),
    v.object({
      kind: v.literal("none"),
      candidates: v.array(v.object({ ingredientId: v.id("ingredients"), name: v.string() })),
    }),
  ),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);

    // The name itself, in any case or spacing: one indexed read. Anything else (aliases,
    // plurals, two ingredients under one name) goes through the full resolver below.
    const nameKey = normalizeName(args.name);
    const sameName = await ctx.db
      .query("ingredients")
      .withIndex("by_householdId_nameKey", (q) =>
        q.eq("householdId", householdId).eq("nameKey", nameKey),
      )
      .take(2);
    if (nameKey !== "" && sameName.length === 1) {
      const [only] = sameName;
      const how = only.name === args.name.trim() ? ("exact" as const) : ("case" as const);
      return { kind: "match" as const, ingredientId: only._id, name: only.name, how };
    }

    const ingredients = await ctx.db
      .query("ingredients")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    const sorted = ingredients.sort(byName);
    const nameOf = new Map(sorted.map((i) => [i._id, i.name]));
    const result = resolveIngredient(args.name, sorted);
    if (result.kind === "match") {
      return { ...result, name: nameOf.get(result.ingredientId) ?? "" };
    }
    return {
      kind: "none" as const,
      candidates: result.candidates.map((id) => ({ ingredientId: id, name: nameOf.get(id) ?? "" })),
    };
  },
});
