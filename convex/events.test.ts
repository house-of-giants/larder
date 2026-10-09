import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { recordInventoryEvent } from "./lib/ledger";
import schema from "./schema";
import { createHousehold, identityFor, type Test } from "./test_helpers";

const modules = import.meta.glob("./**/*.ts");

async function memberIdOf(t: Test, who: string): Promise<Id<"members">> {
  const subject = identityFor(who).subject;
  const member = await t.run((ctx) =>
    ctx.db
      .query("members")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", subject))
      .unique(),
  );
  if (member === null) throw new Error(`no member for ${who}`);
  return member._id;
}

async function record(
  t: Test,
  householdId: Id<"households">,
  memberId: Id<"members">,
  payload: unknown,
) {
  return await t.run((ctx) =>
    recordInventoryEvent(ctx, {
      householdId,
      type: "adjustment",
      actor: { kind: "member", memberId },
      refs: {},
      payload,
    }),
  );
}

describe("recordInventoryEvent", () => {
  it("writes a row that events.recent returns", async () => {
    const t = convexTest(schema, modules);
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "A" });
    const memberId = await memberIdOf(t, "Alice");

    const before = Date.now();
    const id = await record(t, householdId, memberId, {
      before: { level: "full" },
      after: { level: "half" },
    });

    const events = await as.query(api.events.recent, {});
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      _id: id,
      householdId,
      type: "adjustment",
      actor: { kind: "member", memberId },
      refs: {},
      payload: { before: { level: "full" }, after: { level: "half" } },
    });
    expect(events[0].at).toBeGreaterThanOrEqual(before);
  });
});

describe("events.recent", () => {
  it("never returns another household's events", async () => {
    const t = convexTest(schema, modules);
    const a = await createHousehold(t, { who: "Alice", name: "A" });
    const b = await createHousehold(t, { who: "Bob", name: "B" });
    await record(t, a.householdId, await memberIdOf(t, "Alice"), { n: "a" });
    await record(t, b.householdId, await memberIdOf(t, "Bob"), { n: "b" });

    const seenByB = await b.as.query(api.events.recent, {});
    expect(seenByB.map((e) => e.payload)).toEqual([{ n: "b" }]);
    const seenByA = await a.as.query(api.events.recent, {});
    expect(seenByA.map((e) => e.payload)).toEqual([{ n: "a" }]);
  });

  it("returns newest first and honors limit", async () => {
    const t = convexTest(schema, modules);
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "A" });
    const memberId = await memberIdOf(t, "Alice");
    // Distinct `at` values regardless of clock resolution.
    await t.run(async (ctx) => {
      for (const n of [1, 2, 3, 4, 5]) {
        await ctx.db.insert("inventoryEvents", {
          householdId,
          type: "adjustment",
          at: 1_000 * n,
          actor: { kind: "member", memberId },
          refs: {},
          payload: { n },
        });
      }
    });

    const three = await as.query(api.events.recent, { limit: 3 });
    expect(three.map((e) => e.payload.n)).toEqual([5, 4, 3]);
    const all = await as.query(api.events.recent, {});
    expect(all.map((e) => e.payload.n)).toEqual([5, 4, 3, 2, 1]);
  });

  it("caps limit at 200", async () => {
    const t = convexTest(schema, modules);
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "A" });
    const memberId = await memberIdOf(t, "Alice");
    await t.run(async (ctx) => {
      for (let n = 0; n < 205; n++) {
        await ctx.db.insert("inventoryEvents", {
          householdId,
          type: "adjustment",
          at: n,
          actor: { kind: "member", memberId },
          refs: {},
          payload: { n },
        });
      }
    });
    expect(await as.query(api.events.recent, { limit: 1_000 })).toHaveLength(200);
    expect(await as.query(api.events.recent, {})).toHaveLength(50);
  });
});
