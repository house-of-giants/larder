import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Every household-scoped function starts with `requireMember`. The household comes from
// the signed-in member's row, never from an argument the client sends.

export async function requireIdentity(ctx: QueryCtx): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new ConvexError("Sign in first.");
  }
  return identity;
}

/** The caller's member row, or null when they have not joined a household yet. */
export async function findMember(ctx: QueryCtx, identity: UserIdentity) {
  return await ctx.db
    .query("members")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
}

export async function requireMember(ctx: QueryCtx): Promise<{
  identity: UserIdentity;
  member: Doc<"members">;
  householdId: Id<"households">;
}> {
  const identity = await requireIdentity(ctx);
  const member = await findMember(ctx, identity);
  if (member === null) {
    throw new ConvexError("Join a household first.");
  }
  return { identity, member, householdId: member.householdId };
}
