import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { requireSeedAllowed } from "./lib/dev_only";
import { uniqueInviteCode } from "./lib/household";

// Dev-only helpers, callable with `bunx convex run testing:<name>` on the dev deployment.
// They are internal functions, so no client can reach them, and they refuse to run unless
// the deployment sets SEED_ALLOWED=true. The member they create carries a
// made-up Clerk user id; it exists so seed.load has a household to fill before real
// sign-in exists.
export const createDevHousehold = internalMutation({
  args: { name: v.string(), clerkUserId: v.string() },
  returns: v.id("households"),
  handler: async (ctx, args) => {
    requireSeedAllowed();
    const now = Date.now();
    const householdId = await ctx.db.insert("households", {
      name: args.name,
      inviteCode: await uniqueInviteCode(ctx),
      createdAt: now,
    });
    await ctx.db.insert("members", {
      householdId,
      clerkUserId: args.clerkUserId,
      name: "Dev member",
      joinedAt: now,
    });
    return householdId;
  },
});

export const summary = internalQuery({
  args: { householdId: v.id("households") },
  returns: v.object({
    ingredients: v.number(),
    pantryItems: v.number(),
    recipes: v.number(),
    recipeIngredients: v.number(),
    weeks: v.number(),
    inventoryEvents: v.number(),
  }),
  handler: async (ctx, { householdId }) => {
    requireSeedAllowed();
    const count = async (
      table:
        | "ingredients"
        | "pantryItems"
        | "recipes"
        | "recipeIngredients"
        | "weeks"
        | "inventoryEvents",
    ) =>
      (
        await ctx.db
          .query(table)
          .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
          .collect()
      ).length;
    return {
      ingredients: await count("ingredients"),
      pantryItems: await count("pantryItems"),
      recipes: await count("recipes"),
      recipeIngredients: await count("recipeIngredients"),
      weeks: await count("weeks"),
      inventoryEvents: await count("inventoryEvents"),
    };
  },
});
