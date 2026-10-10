import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { findMember, requireIdentity, requireMember } from "./lib/auth";
import {
  deleteHousehold,
  householdScopedTables,
  normalizeInviteCode,
  uniqueInviteCode,
} from "./lib/household";

function householdName(raw: string): string {
  const name = raw.trim();
  if (name === "") {
    throw new ConvexError("Give the household a name.");
  }
  return name;
}

export const current = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      household: v.object({
        _id: v.id("households"),
        name: v.string(),
        inviteCode: v.string(),
      }),
      members: v.array(
        v.object({
          _id: v.id("members"),
          name: v.optional(v.string()),
          joinedAt: v.number(),
          isYou: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const member = await findMember(ctx, identity);
    if (member === null) return null;

    const household = await ctx.db.get(member.householdId);
    if (household === null) return null;

    const members = await ctx.db
      .query("members")
      .withIndex("by_householdId", (q) => q.eq("householdId", household._id))
      .collect();

    return {
      household: { _id: household._id, name: household.name, inviteCode: household.inviteCode },
      members: [...members]
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((m) => ({
          _id: m._id,
          name: m.name,
          joinedAt: m.joinedAt,
          isYou: m._id === member._id,
        })),
    };
  },
});

export const create = mutation({
  args: { name: v.string() },
  returns: v.id("households"),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if ((await findMember(ctx, identity)) !== null) {
      throw new ConvexError("You are already in a household.");
    }
    const now = Date.now();
    const householdId = await ctx.db.insert("households", {
      name: householdName(args.name),
      inviteCode: await uniqueInviteCode(ctx),
      createdAt: now,
    });
    await ctx.db.insert("members", {
      householdId,
      clerkUserId: identity.subject,
      name: identity.name ?? identity.email ?? undefined,
      joinedAt: now,
    });
    return householdId;
  },
});

export const join = mutation({
  args: { inviteCode: v.string() },
  returns: v.id("households"),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    if ((await findMember(ctx, identity)) !== null) {
      throw new ConvexError("You are already in a household.");
    }
    const household = await ctx.db
      .query("households")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", normalizeInviteCode(args.inviteCode)))
      .unique();
    if (household === null) {
      throw new ConvexError("That invite code does not match a household.");
    }
    await ctx.db.insert("members", {
      householdId: household._id,
      clerkUserId: identity.subject,
      name: identity.name ?? identity.email ?? undefined,
      joinedAt: Date.now(),
    });
    return household._id;
  },
});

/**
 * Brings the caller's member name up to date with the sign-in: a member who joined before
 * the Clerk token carried a name claim gets it on their next visit. Only the caller's own
 * row; a sign-in with no name leaves the one there.
 */
export const refreshName = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { identity, member } = await requireMember(ctx);
    const name = identity.name ?? identity.email;
    if (name !== undefined && name !== member.name) {
      await ctx.db.patch(member._id, { name });
    }
    return null;
  },
});

export const rename = mutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    await ctx.db.patch(householdId, { name: householdName(args.name) });
    return null;
  },
});

export const rotateInviteCode = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const { householdId } = await requireMember(ctx);
    const inviteCode = await uniqueInviteCode(ctx);
    await ctx.db.patch(householdId, { inviteCode });
    return inviteCode;
  },
});

export const leave = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { member, householdId } = await requireMember(ctx);
    await ctx.db.delete(member._id);
    const remaining = await ctx.db
      .query("members")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .first();
    if (remaining === null) {
      await deleteHousehold(ctx, householdId);
    }
    return null;
  },
});

/** Rows one sweep run deletes before it hands the rest to the next run. */
export const sweepBatch = 500;

/**
 * Deletes a deleted household's rows, table by table, at most `sweepBatch` per run, and
 * schedules itself again until none are left. Scheduled by deleteHousehold.
 */
export const sweep = internalMutation({
  args: { householdId: v.id("households") },
  returns: v.null(),
  handler: async (ctx, { householdId }) => {
    if ((await ctx.db.get("households", householdId)) !== null) {
      throw new Error("That household still exists; only a deleted household is swept.");
    }
    let budget = sweepBatch;
    for (const table of householdScopedTables) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
        .take(budget);
      for (const row of rows) {
        await ctx.db.delete(table, row._id);
      }
      budget -= rows.length;
      if (budget === 0) {
        await ctx.scheduler.runAfter(0, internal.households.sweep, { householdId });
        return null;
      }
    }
    return null;
  },
});
