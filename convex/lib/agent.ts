import { ConvexError, v } from "convex/values";
import { hashAgentToken, newAgentToken, sameSecret } from "../../src/lib/agent-tokens";
import type { Id } from "../_generated/dataModel";
import { type MutationCtx, type QueryCtx, env } from "../_generated/server";
import type { Caller } from "./auth";

// The MCP door's way in. The server route (src/routes/mcp.ts) holds AGENT_SECRET, resolves
// the bearer token to a household and token id with it, and passes all three to every
// agent function. The household never comes from the MCP client's arguments.
//
// Every refusal reads the same, so a caller learns nothing about which part was wrong.

export const agentRefused = "Agent access refused.";

/** A new token for the household: the plaintext to show once, and the stored row's id. */
export async function mintToken(
  ctx: MutationCtx,
  householdId: Id<"households">,
  label: string,
): Promise<{ tokenId: Id<"householdTokens">; token: string }> {
  const token = newAgentToken();
  const tokenId = await ctx.db.insert("householdTokens", {
    householdId,
    tokenHash: await hashAgentToken(token),
    label,
    createdAt: Date.now(),
  });
  return { tokenId, token };
}

/** What the server route adds to every agent function's arguments. */
export const agentArgs = {
  agentSecret: v.string(),
  householdId: v.id("households"),
  tokenId: v.id("householdTokens"),
};

export type AgentArgs = {
  agentSecret: string;
  householdId: Id<"households">;
  tokenId: Id<"householdTokens">;
};

/** The deployment's AGENT_SECRET, compared in constant time; unset refuses everyone. */
export function requireAgentSecret(agentSecret: string) {
  const expected = env.AGENT_SECRET;
  if (!expected) {
    console.error("AGENT_SECRET is not set on this deployment; the MCP door is closed.");
    throw new ConvexError(agentRefused);
  }
  if (!sameSecret(agentSecret, expected)) {
    throw new ConvexError(agentRefused);
  }
}

/** The secret, the household, and a live token of that household, as a Caller. */
export async function requireAgent(
  ctx: QueryCtx,
  { agentSecret, householdId, tokenId }: AgentArgs,
): Promise<Caller> {
  requireAgentSecret(agentSecret);
  const household = await ctx.db.get("households", householdId);
  const token = await ctx.db.get("householdTokens", tokenId);
  if (
    household === null ||
    token === null ||
    token.householdId !== householdId ||
    token.revokedAt !== undefined
  ) {
    throw new ConvexError(agentRefused);
  }
  return { householdId, actor: { kind: "token", tokenId } };
}

/** Splits an agent function's arguments into the Caller and the function's own arguments. */
export async function asAgent<A extends AgentArgs>(
  ctx: QueryCtx,
  args: A,
): Promise<[Caller, Omit<A, keyof AgentArgs>]> {
  const { agentSecret, householdId, tokenId, ...rest } = args;
  return [await requireAgent(ctx, { agentSecret, householdId, tokenId }), rest];
}
