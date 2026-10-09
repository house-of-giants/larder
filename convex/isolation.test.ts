import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import * as events from "./events";
import * as households from "./households";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Registry of every public household-scoped function. Each phase that adds one adds it
// here, with arguments that would otherwise be valid. An anonymous caller must be refused.
type Case = {
  name: string;
  kind: "query" | "mutation";
  fn: FunctionReference<"query" | "mutation", "public">;
  args: Record<string, unknown>;
};

const cases: Case[] = [
  { name: "households.current", kind: "query", fn: api.households.current, args: {} },
  { name: "households.create", kind: "mutation", fn: api.households.create, args: { name: "A" } },
  {
    name: "households.join",
    kind: "mutation",
    fn: api.households.join,
    args: { inviteCode: "000000000000" },
  },
  { name: "households.rename", kind: "mutation", fn: api.households.rename, args: { name: "A" } },
  {
    name: "households.rotateInviteCode",
    kind: "mutation",
    fn: api.households.rotateInviteCode,
    args: {},
  },
  { name: "households.leave", kind: "mutation", fn: api.households.leave, args: {} },
  { name: "events.recent", kind: "query", fn: api.events.recent, args: {} },
];

// Public functions per module; health.ping is deliberately open (it reports signed-in state).
const scopedModules = { households, events };

function publicFunctionNames() {
  return Object.entries(scopedModules).flatMap(([module, exports]) =>
    Object.entries(exports)
      .filter(([, value]) => (value as { isPublic?: boolean }).isPublic === true)
      .map(([name]) => `${module}.${name}`),
  );
}

describe("isolation registry", () => {
  it("lists every public function in the household-scoped modules", () => {
    expect(cases.map((c) => c.name).sort()).toEqual(publicFunctionNames().sort());
  });
});

describe("anonymous callers", () => {
  it.each(cases)("$name refuses an anonymous caller", async ({ kind, fn, args }) => {
    const t = convexTest(schema, modules);
    const call =
      kind === "query"
        ? t.query(fn as FunctionReference<"query">, args)
        : t.mutation(fn as FunctionReference<"mutation">, args);
    await expect(call).rejects.toMatchObject({ data: "Sign in first." });
    // Nothing was written on the way to the refusal.
    const households = await t.run((ctx) => ctx.db.query("households").collect());
    expect(households).toEqual([]);
  });
});
