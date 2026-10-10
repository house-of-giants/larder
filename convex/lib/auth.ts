import type { UserIdentity } from "convex/server";
import { ConvexError, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { inventoryActor } from "../schema";

// Every household-scoped function starts with `requireMember` (people) or `requireAgent`
// (convex/lib/agent.ts, the MCP door). The household comes from the signed-in member's
// row or from the agent token the server resolved, never from an argument a client sends.

/** Who is acting, as the ledger records it. */
export type Actor = Infer<typeof inventoryActor>;

/** The household a function acts on and who is acting; shared logic takes this. */
export type Caller = { householdId: Id<"households">; actor: Actor };

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

/** The signed-in member as a Caller, for functions whose logic agents share. */
export async function requireCaller(ctx: QueryCtx): Promise<Caller> {
  const { householdId, member } = await requireMember(ctx);
  return { householdId, actor: { kind: "member", memberId: member._id } };
}
