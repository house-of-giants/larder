import type { Id, TableNames } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";

// Every table that carries a householdId, each with a `by_householdId` index.
// A new household-scoped table must be added here, or the sweep after a household is
// deleted leaves it behind.
export const householdScopedTables = [
  "members",
  "householdTokens",
  "ingredients",
  "pantryItems",
  "recipes",
  "recipeIngredients",
  "weeks",
  "weekRecipes",
  "weekAdaptations",
  "lists",
  "listItems",
  "cookingEvents",
  "preparedFoods",
  "inventoryEvents",
] as const satisfies readonly Exclude<TableNames, "households">[];

/**
 * Deletes the household now, so no one can open or join it, and schedules
 * households.sweep to delete its rows in batches: a long-lived household has more rows
 * than one mutation may write.
 */
export async function deleteHousehold(ctx: MutationCtx, householdId: Id<"households">) {
  await ctx.db.delete("households", householdId);
  await ctx.scheduler.runAfter(0, internal.households.sweep, { householdId });
}

const inviteAlphabet = "0123456789abcdefghjkmnpqrstvwxyz"; // 32 symbols, no i, l, o, u
const inviteLength = 12;

/** 12 URL-safe characters from crypto.getRandomValues; 32 divides 256, so no modulo bias. */
export function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(inviteLength));
  return Array.from(bytes, (b) => inviteAlphabet[b % inviteAlphabet.length]).join("");
}

/** Invite codes are lowercase; people retype them with stray spaces and capitals. */
export function normalizeInviteCode(code: string): string {
  return code.trim().toLowerCase();
}

/** A fresh code no other household holds. */
export async function uniqueInviteCode(ctx: MutationCtx): Promise<string> {
  for (;;) {
    const code = newInviteCode();
    const taken = await ctx.db
      .query("households")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", code))
      .first();
    if (taken === null) return code;
  }
}
