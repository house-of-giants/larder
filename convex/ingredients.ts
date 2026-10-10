import { ConvexError, type Infer, type ObjectType, v } from "convex/values";
import { normalizeName, resolveIngredient } from "../src/lib/aliases";
import type { Doc } from "./_generated/dataModel";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { type Caller, requireCaller, requireMember } from "./lib/auth";
import { findPantryRow, requireIngredient } from "./lib/pantry";
import schema from "./schema";

export const ingredientDoc = v.object({
  _id: v.id("ingredients"),
  _creationTime: v.number(),
  ...schema.tables.ingredients.validator.fields,
});

const byName = (a: Doc<"ingredients">, b: Doc<"ingredients">) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export const list = query({
  args: {},
  returns: v.array(ingredientDoc),
  handler: async (ctx) => listIngredients(ctx, await requireCaller(ctx)),
});

export async function listIngredients(ctx: QueryCtx, { householdId }: Caller) {
  const rows = await ctx.db
    .query("ingredients")
    .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
    .collect();
  return rows.sort(byName);
}

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

export const upsertArgs = {
  id: v.optional(v.id("ingredients")),
  name: v.string(),
  kind: schema.tables.ingredients.validator.fields.kind,
  category: v.string(),
  defaultUnit: v.optional(v.string()),
  aliases: v.array(v.string()),
  tracked: v.boolean(),
  notes: v.optional(v.string()),
};

export const upsert = mutation({
  args: upsertArgs,
  returns: v.id("ingredients"),
  handler: async (ctx, args) => upsertIngredient(ctx, await requireCaller(ctx), args),
});

export async function upsertIngredient(
  ctx: MutationCtx,
  { householdId }: Caller,
  args: ObjectType<typeof upsertArgs>,
) {
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
}

export const resolveResult = v.union(
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
);

export const resolve = query({
  args: { name: v.string() },
  returns: resolveResult,
  handler: async (ctx, args) => resolveIngredientName(ctx, await requireCaller(ctx), args),
});

export async function resolveIngredientName(
  ctx: QueryCtx,
  caller: Caller,
  args: { name: string },
): Promise<Infer<typeof resolveResult>> {
  const { householdId } = caller;
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
  return resolveByName(await listIngredients(ctx, caller), args.name);
}

/** The full alias resolver over a sorted ingredient list, with names beside the ids. */
export function resolveByName(
  ingredients: Doc<"ingredients">[],
  name: string,
): Infer<typeof resolveResult> {
  const nameOf = new Map(ingredients.map((i) => [i._id, i.name]));
  const result = resolveIngredient(name, ingredients);
  if (result.kind === "match") {
    return { ...result, name: nameOf.get(result.ingredientId) ?? "" };
  }
  return {
    kind: "none" as const,
    candidates: result.candidates.map((id) => ({ ingredientId: id, name: nameOf.get(id) ?? "" })),
  };
}
