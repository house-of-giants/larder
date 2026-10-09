import { v } from "convex/values";
import { query } from "./_generated/server";

// Smallest round trip the shell can make: proves the deployment is reachable and
// which identity (if any) the caller carries.
export const ping = query({
  args: {},
  returns: v.object({ ok: v.literal(true), signedIn: v.boolean() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return { ok: true as const, signedIn: identity !== null };
  },
});
