import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { mintToken } from "./lib/agent";
import { requireMember } from "./lib/auth";

// Agent tokens, managed by members on the settings screen. The plaintext leaves the server
// once, in create's return value; the table keeps only its SHA-256. Revoked tokens stay
// listed so people can see what was shut off; the MCP door refuses them.

const tokenNotHere = "That token is not here.";

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("householdTokens"),
      label: v.string(),
      createdAt: v.number(),
      lastUsedAt: v.optional(v.number()),
      revokedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const { householdId } = await requireMember(ctx);
    const tokens = await ctx.db
      .query("householdTokens")
      .withIndex("by_householdId", (q) => q.eq("householdId", householdId))
      .collect();
    return tokens
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(({ _id, label, createdAt, lastUsedAt, revokedAt }) => ({
        _id,
        label,
        createdAt,
        lastUsedAt,
        revokedAt,
      }));
  },
});

export const create = mutation({
  args: { label: v.string() },
  returns: v.object({ tokenId: v.id("householdTokens"), token: v.string() }),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const label = args.label.trim().replace(/\s+/g, " ");
    if (label === "") {
      throw new ConvexError("Name the token, like Hermes or Claude.");
    }
    return await mintToken(ctx, householdId, label);
  },
});

export const revoke = mutation({
  args: { tokenId: v.id("householdTokens") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { householdId } = await requireMember(ctx);
    const token = await ctx.db.get("householdTokens", args.tokenId);
    if (token === null || token.householdId !== householdId) {
      throw new ConvexError(tokenNotHere);
    }
    if (token.revokedAt === undefined) {
      await ctx.db.patch("householdTokens", token._id, { revokedAt: Date.now() });
    }
    return null;
  },
});
