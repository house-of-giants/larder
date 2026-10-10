import type { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { convexBackend } from "./backend";

const identity = {
  agentSecret: "s3cret-value",
  householdId: "hh_1" as Id<"households">,
  tokenId: "tok_1" as Id<"householdTokens">,
};

/** A client whose every call records its arguments and then throws `error`. */
function failingClient(error: unknown, seen: unknown[] = []) {
  const fail = async (_fn: unknown, args: unknown) => {
    seen.push(args);
    throw error;
  };
  return { query: fail, mutation: fail } as unknown as ConvexHttpClient;
}

describe("convexBackend", () => {
  it("sends the route's identity beside the tool's own arguments", async () => {
    const seen: unknown[] = [];
    const backend = convexBackend(failingClient(new ConvexError("x"), seen), identity);
    await backend.ingredientsResolve({ name: "eggs" }).catch(() => {});
    expect(seen).toEqual([{ name: "eggs", ...identity }]);
  });

  it("turns a ConvexError into its own sentence", async () => {
    const backend = convexBackend(
      failingClient(new ConvexError("Close the current week first.")),
      identity,
    );
    await expect(backend.weeksCreate({ weekOf: "2026-10-16" })).rejects.toThrow(
      /^Close the current week first\.$/,
    );
  });

  it("never lets the agent secret out in another error's message", async () => {
    const echoed = new Error(
      `[Request ID: abc123] Server Error\nArgumentValidationError: Object: {agentSecret: "${identity.agentSecret}", weekId: "x"}`,
    );
    const backend = convexBackend(failingClient(echoed), identity);
    const error = await backend.listGenerate({ weekId: "x" as Id<"weeks"> }).catch((e) => e);
    expect(error.message).toBe(
      'ArgumentValidationError: Object: {agentSecret: "[redacted]", weekId: "x"}',
    );
  });
});
