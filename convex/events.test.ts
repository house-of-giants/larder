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

  it("returns newest first by `at`, whatever order the rows were written in", async () => {
    const t = convexTest(schema, modules);
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "A" });
    const memberId = await memberIdOf(t, "Alice");
    // Written out of order, so neither insertion order nor _creationTime matches `at`.
    await insertEvents(t, householdId, memberId, [3, 1, 5, 2, 4]);

    const all = await as.query(api.events.recent, {});
    expect(all.map((e) => e.at)).toEqual([5, 4, 3, 2, 1]);
    const three = await as.query(api.events.recent, { limit: 3 });
    expect(three.map((e) => e.at)).toEqual([5, 4, 3]);
  });

  describe("limit", () => {
    // 205 events with `at` 0..204 written in a scrambled order.
    const ats = Array.from({ length: 205 }, (_, i) => (i * 7) % 205);
    const newest = (n: number) => Array.from({ length: n }, (_, i) => 204 - i);

    it.each([
      ["omitted", undefined, newest(50)],
      ["NaN", Number.NaN, newest(50)],
      ["Infinity", Number.POSITIVE_INFINITY, newest(50)],
      ["0.5", 0.5, newest(1)],
      ["0", 0, newest(1)],
      ["-1", -1, newest(1)],
      ["3", 3, newest(3)],
      ["1000", 1000, newest(200)],
    ])("%s returns the newest rows it allows", async (_label, limit, expected) => {
      const t = convexTest(schema, modules);
      const { as, householdId } = await createHousehold(t, { who: "Alice", name: "A" });
      await insertEvents(t, householdId, await memberIdOf(t, "Alice"), ats);

      const events = await as.query(api.events.recent, limit === undefined ? {} : { limit });
      expect(events.map((e) => e.at)).toEqual(expected);
    });
  });
});

async function insertEvents(
  t: Test,
  householdId: Id<"households">,
  memberId: Id<"members">,
  ats: number[],
) {
  await t.run(async (ctx) => {
    for (const at of ats) {
      await ctx.db.insert("inventoryEvents", {
        householdId,
        type: "adjustment",
        at,
        actor: { kind: "member", memberId },
        refs: {},
        payload: { at },
      });
    }
  });
}
