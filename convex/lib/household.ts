import type { Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

// Every table that carries a householdId, each with a `by_householdId` index.
// A new household-scoped table must be added here, or deleting a household leaves it behind.
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

/** Deletes the household and every row that belongs to it, in one transaction. */
export async function deleteHousehold(ctx: MutationCtx, householdId: Id<"households">) {
  for (const table of householdScopedTables) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
  }
  await ctx.db.delete(householdId);
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
