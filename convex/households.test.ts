import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { householdScopedTables } from "./lib/household";
import schema from "./schema";
import { createHousehold, identityFor, type Test } from "./test_helpers";

const modules = import.meta.glob("./**/*.ts");

const newTest = (): Test => convexTest(schema, modules);

async function inviteCodeOf(t: Test, householdId: Id<"households">) {
  const household = await t.run((ctx) => ctx.db.get(householdId));
  if (household === null) throw new Error("household missing");
  return household.inviteCode;
}

describe("households.create and current", () => {
  it("creates the household and makes the caller its only member", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "  Elm Street " });

    const current = await as.query(api.households.current, {});
    expect(current?.household._id).toBe(householdId);
    expect(current?.household.name).toBe("Elm Street");
    expect(current?.household.inviteCode).toMatch(/^[0-9a-z]{12}$/);
    expect(current?.members).toEqual([
      { _id: expect.any(String), name: "Alice", joinedAt: expect.any(Number), isYou: true },
    ]);
  });

  it("returns null for a signed-in caller with no household", async () => {
    const t = newTest();
    await expect(
      t.withIdentity(identityFor("Nobody")).query(api.households.current, {}),
    ).resolves.toBeNull();
  });

  it("rejects a second household for the same person", async () => {
    const t = newTest();
    const { as } = await createHousehold(t, { who: "Alice", name: "Elm Street" });
    await expect(as.mutation(api.households.create, { name: "Second" })).rejects.toMatchObject({
      data: "You are already in a household.",
    });
    const households = await t.run((ctx) => ctx.db.query("households").collect());
    expect(households.map((h) => h.name)).toEqual(["Elm Street"]);
  });

  it("rejects a blank name", async () => {
    const t = newTest();
    const as = t.withIdentity(identityFor("Alice"));
    await expect(as.mutation(api.households.create, { name: "   " })).rejects.toMatchObject({
      data: "Give the household a name.",
    });
    await expect(as.query(api.households.current, {})).resolves.toBeNull();
  });

  it("gives each household a different invite code", async () => {
    const t = newTest();
    const a = await createHousehold(t, { who: "Alice", name: "A" });
    const b = await createHousehold(t, { who: "Bob", name: "B" });
    expect(await inviteCodeOf(t, a.householdId)).not.toBe(await inviteCodeOf(t, b.householdId));
  });
});

describe("households.join", () => {
  it("adds the caller to the household that holds the code", async () => {
    const t = newTest();
    const { as: alice, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const code = await inviteCodeOf(t, householdId);
    const carol = t.withIdentity(identityFor("Carol"));

    // Codes are typed by hand; stray spaces and capitals still match.
    await expect(
      carol.mutation(api.households.join, { inviteCode: ` ${code.toUpperCase()} ` }),
    ).resolves.toBe(householdId);

    const seenByCarol = await carol.query(api.households.current, {});
    expect(seenByCarol?.household._id).toBe(householdId);
    expect(seenByCarol?.members.map((m) => [m.name, m.isYou])).toEqual([
      ["Alice", false],
      ["Carol", true],
    ]);
    const seenByAlice = await alice.query(api.households.current, {});
    expect(seenByAlice?.members.map((m) => [m.name, m.isYou])).toEqual([
      ["Alice", true],
      ["Carol", false],
    ]);
  });

  it("rejects a code that matches no household", async () => {
    const t = newTest();
    await createHousehold(t, { who: "Alice", name: "Elm" });
    const carol = t.withIdentity(identityFor("Carol"));
    await expect(
      carol.mutation(api.households.join, { inviteCode: "zzzzzzzzzzzz" }),
    ).rejects.toMatchObject({ data: "That invite code does not match a household." });
    await expect(carol.query(api.households.current, {})).resolves.toBeNull();
  });

  it("rejects a caller who already has a household", async () => {
    const t = newTest();
    const a = await createHousehold(t, { who: "Alice", name: "A" });
    const b = await createHousehold(t, { who: "Bob", name: "B" });
    const code = await inviteCodeOf(t, a.householdId);
    await expect(b.as.mutation(api.households.join, { inviteCode: code })).rejects.toMatchObject({
      data: "You are already in a household.",
    });
    const bob = await b.as.query(api.households.current, {});
    expect(bob?.household._id).toBe(b.householdId);
  });
});

describe("household isolation", () => {
  it("shows each member only their own household", async () => {
    const t = newTest();
    const a = await createHousehold(t, { who: "Alice", name: "A" });
    const b = await createHousehold(t, { who: "Bob", name: "B" });

    const seenByA = await a.as.query(api.households.current, {});
    const seenByB = await b.as.query(api.households.current, {});
    expect(seenByA?.household).toMatchObject({ _id: a.householdId, name: "A" });
    expect(seenByA?.members.map((m) => m.name)).toEqual(["Alice"]);
    expect(seenByB?.household).toMatchObject({ _id: b.householdId, name: "B" });
    expect(seenByB?.members.map((m) => m.name)).toEqual(["Bob"]);
  });

  it("renames only the caller's household", async () => {
    const t = newTest();
    const a = await createHousehold(t, { who: "Alice", name: "A" });
    const b = await createHousehold(t, { who: "Bob", name: "B" });
    await a.as.mutation(api.households.rename, { name: "A2" });
    expect((await t.run((ctx) => ctx.db.get(a.householdId)))?.name).toBe("A2");
    expect((await t.run((ctx) => ctx.db.get(b.householdId)))?.name).toBe("B");
  });
});

describe("households.rename", () => {
  it("trims the new name", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    await as.mutation(api.households.rename, { name: "  Oak Lane  " });
    expect((await t.run((ctx) => ctx.db.get(householdId)))?.name).toBe("Oak Lane");
  });

  it("rejects an empty name and keeps the old one", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    await expect(as.mutation(api.households.rename, { name: " \t " })).rejects.toMatchObject({
      data: "Give the household a name.",
    });
    expect((await t.run((ctx) => ctx.db.get(householdId)))?.name).toBe("Elm");
  });
});

describe("households.rotateInviteCode", () => {
  it("replaces the code so the old one stops working", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const oldCode = await inviteCodeOf(t, householdId);

    const newCode = await as.mutation(api.households.rotateInviteCode, {});
    expect(newCode).not.toBe(oldCode);
    expect(await inviteCodeOf(t, householdId)).toBe(newCode);

    const carol = t.withIdentity(identityFor("Carol"));
    await expect(
      carol.mutation(api.households.join, { inviteCode: oldCode }),
    ).rejects.toMatchObject({ data: "That invite code does not match a household." });
    await expect(carol.mutation(api.households.join, { inviteCode: newCode })).resolves.toBe(
      householdId,
    );
  });
});

describe("households.leave", () => {
  it("removes the member and keeps the household for the others", async () => {
    const t = newTest();
    const { as: alice, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const carol = t.withIdentity(identityFor("Carol"));
    await carol.mutation(api.households.join, { inviteCode: await inviteCodeOf(t, householdId) });

    await carol.mutation(api.households.leave, {});

    await expect(carol.query(api.households.current, {})).resolves.toBeNull();
    const seenByAlice = await alice.query(api.households.current, {});
    expect(seenByAlice?.household._id).toBe(householdId);
    expect(seenByAlice?.members.map((m) => m.name)).toEqual(["Alice"]);
  });

  it("deletes the household and all its rows when the last member leaves", async () => {
    const t = newTest();
    const a = await createHousehold(t, { who: "Alice", name: "A" });
    const b = await createHousehold(t, { who: "Bob", name: "B" });

    // One ingredient and one ledger row per household; only A's should go.
    await t.run(async (ctx) => {
      for (const { householdId, who } of [
        { householdId: a.householdId, who: "user_alice" },
        { householdId: b.householdId, who: "user_bob" },
      ]) {
        await ctx.db.insert("ingredients", {
          householdId,
          name: "eggs",
          kind: "count",
          category: "dairy",
          aliases: [],
          tracked: true,
          needsReview: false,
        });
        const member = await ctx.db
          .query("members")
          .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", who))
          .unique();
        await ctx.db.insert("inventoryEvents", {
          householdId,
          type: "adjustment",
          at: 1,
          actor: { kind: "member", memberId: member!._id },
          refs: {},
          payload: {},
        });
      }
    });

    await a.as.mutation(api.households.leave, {});

    const left = await t.run(async (ctx) => ({
      households: await ctx.db.query("households").collect(),
      members: await ctx.db.query("members").collect(),
      ingredients: await ctx.db.query("ingredients").collect(),
      events: await ctx.db.query("inventoryEvents").collect(),
    }));
    expect(left.households.map((h) => h._id)).toEqual([b.householdId]);
    expect(left.members.map((m) => m.householdId)).toEqual([b.householdId]);
    expect(left.ingredients.map((i) => i.householdId)).toEqual([b.householdId]);
    expect(left.events.map((e) => e.householdId)).toEqual([b.householdId]);
    await expect(a.as.query(api.households.current, {})).resolves.toBeNull();
  });

  it("sweeps every household-scoped table in the schema", () => {
    // A table missing from the sweep list would outlive its household.
    const scoped = Object.keys(schema.tables).filter((table) => table !== "households");
    expect([...householdScopedTables].sort()).toEqual(scoped.sort());
  });

  it("rejects a caller with no household", async () => {
    const t = newTest();
    await expect(
      t.withIdentity(identityFor("Nobody")).mutation(api.households.leave, {}),
    ).rejects.toMatchObject({ data: "Join a household first." });
  });
});
