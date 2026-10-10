import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashAgentToken } from "../src/lib/agent-tokens";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { createHousehold, type Test } from "./test_helpers";

const modules = import.meta.glob("./**/*.ts");
const secret = "test-agent-secret";
const refused = "Agent access refused.";

// The deployment's AGENT_SECRET; the vitest config resets stubs between tests.
beforeEach(() => {
  vi.stubEnv("AGENT_SECRET", secret);
});

type Household = Awaited<ReturnType<typeof createHousehold>>;

/** A household with one agent token, as the MCP route would hold it after resolving. */
async function householdWithToken(t: Test, who: string) {
  const home = await createHousehold(t, { who, name: `${who}'s` });
  const { token, tokenId } = await home.as.mutation(api.tokens.create, { label: "Hermes" });
  const agent = { agentSecret: secret, householdId: home.householdId, tokenId };
  return { ...home, token, tokenId, agent };
}

async function addIngredient(
  home: Household,
  name: string,
  kind: "count" | "level" = "count",
): Promise<Id<"ingredients">> {
  return await home.as.mutation(api.ingredients.upsert, {
    name,
    kind,
    category: "produce",
    aliases: [],
    tracked: true,
  });
}

describe("tokens", () => {
  it("shows the token once and stores only its SHA-256", async () => {
    const t = convexTest(schema, modules);
    const { as, token, tokenId } = await householdWithToken(t, "Ana");
    expect(token).toMatch(/^lard_[A-Za-z0-9_-]{43}$/);

    const row = await t.run((ctx) => ctx.db.get(tokenId));
    expect(row?.tokenHash).toBe(await hashAgentToken(token));
    expect(JSON.stringify(row)).not.toContain(token);

    const listed = await as.query(api.tokens.list, {});
    expect(listed).toEqual([{ _id: tokenId, label: "Hermes", createdAt: expect.any(Number) }]);
    expect(JSON.stringify(listed)).not.toContain(row!.tokenHash);
  });

  it("refuses a blank label", async () => {
    const t = convexTest(schema, modules);
    const { as } = await createHousehold(t, { who: "Ana", name: "A" });
    await expect(as.mutation(api.tokens.create, { label: "  " })).rejects.toMatchObject({
      data: "Name the token, like Hermes or Claude.",
    });
  });

  it("revokes only the household's own token", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    const b = await createHousehold(t, { who: "Ben", name: "B" });

    await expect(b.as.mutation(api.tokens.revoke, { tokenId: a.tokenId })).rejects.toMatchObject({
      data: "That token is not here.",
    });
    expect((await t.run((ctx) => ctx.db.get(a.tokenId)))?.revokedAt).toBeUndefined();

    await a.as.mutation(api.tokens.revoke, { tokenId: a.tokenId });
    const [listed] = await a.as.query(api.tokens.list, {});
    expect(listed.revokedAt).toEqual(expect.any(Number));
  });
});

describe("agent.resolveToken", () => {
  it("maps a live token's hash to its household and token", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    const tokenHash = await hashAgentToken(a.token);
    expect(await t.query(api.agent.resolveToken, { agentSecret: secret, tokenHash })).toEqual({
      householdId: a.householdId,
      tokenId: a.tokenId,
    });
  });

  it("returns null for an unknown or revoked token", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    const tokenHash = await hashAgentToken(a.token);
    const unknown = await hashAgentToken("lard_nope");
    expect(
      await t.query(api.agent.resolveToken, { agentSecret: secret, tokenHash: unknown }),
    ).toBeNull();

    await a.as.mutation(api.tokens.revoke, { tokenId: a.tokenId });
    expect(await t.query(api.agent.resolveToken, { agentSecret: secret, tokenHash })).toBeNull();
  });

  it("refuses a wrong secret, and any secret when none is configured", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    const tokenHash = await hashAgentToken(a.token);
    await expect(
      t.query(api.agent.resolveToken, { agentSecret: `${secret}x`, tokenHash }),
    ).rejects.toMatchObject({ data: refused });

    vi.stubEnv("AGENT_SECRET", "");
    await expect(
      t.query(api.agent.resolveToken, { agentSecret: "", tokenHash }),
    ).rejects.toMatchObject({ data: refused });
  });
});

describe("agent.touchToken", () => {
  it("stamps lastUsedAt on the token", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    await t.mutation(api.agent.touchToken, { agentSecret: secret, tokenId: a.tokenId });
    const [listed] = await a.as.query(api.tokens.list, {});
    expect(listed.lastUsedAt).toEqual(expect.any(Number));
  });
});

describe("requireAgent", () => {
  it("refuses a wrong secret", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    await expect(
      t.query(api.agent.pantryList, { ...a.agent, agentSecret: "guess" }),
    ).rejects.toMatchObject({ data: refused });
  });

  it("refuses a household that does not exist", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    const gone = await t.run(async (ctx) => {
      const id = await ctx.db.insert("households", { name: "x", inviteCode: "x", createdAt: 0 });
      await ctx.db.delete(id);
      return id;
    });
    await expect(
      t.query(api.agent.pantryList, { ...a.agent, householdId: gone }),
    ).rejects.toMatchObject({ data: refused });
  });

  it("refuses a token that belongs to another household", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    const b = await householdWithToken(t, "Ben");
    await expect(
      t.query(api.agent.pantryList, { ...a.agent, tokenId: b.tokenId }),
    ).rejects.toMatchObject({ data: refused });
  });

  it("refuses a revoked token, even mid-session", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    await t.query(api.agent.pantryList, a.agent);
    await a.as.mutation(api.tokens.revoke, { tokenId: a.tokenId });
    await expect(t.query(api.agent.pantryList, a.agent)).rejects.toMatchObject({
      data: refused,
    });
  });
});

describe("agent writes stay in the token's household", () => {
  it("pantrySetCount on A writes A's row and ledger only; B sees nothing", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    const b = await createHousehold(t, { who: "Ben", name: "B" });
    const eggs = await addIngredient(a, "eggs");

    const row = await t.mutation(api.agent.pantrySetCount, {
      ...a.agent,
      ingredientId: eggs,
      quantityText: "6",
      unit: "each",
    });
    expect(row).toMatchObject({ name: "eggs", count: { quantityDecimal: 6, unit: "each" } });

    expect(await a.as.query(api.pantry.list, {})).toHaveLength(1);
    expect(await b.as.query(api.pantry.list, {})).toEqual([]);
    expect(await b.as.query(api.events.recent, {})).toEqual([]);

    const [event] = await a.as.query(api.events.recent, {});
    expect(event).toMatchObject({
      type: "adjustment",
      actor: { kind: "token", tokenId: a.tokenId },
    });
  });

  it("an agent cannot reach another household's ingredient by id", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    const b = await createHousehold(t, { who: "Ben", name: "B" });
    const theirs = await addIngredient(b, "eggs");
    await expect(
      t.mutation(api.agent.pantrySetCount, {
        ...a.agent,
        ingredientId: theirs,
        quantityText: "6",
        unit: "each",
      }),
    ).rejects.toMatchObject({ data: "That ingredient is not in this household." });
    expect(await b.as.query(api.pantry.list, {})).toEqual([]);
  });
});

describe("agent.recipesUpsert by names", () => {
  it("resolves known names, creates needsReview ingredients, and returns candidates for mustard", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    const eggs = await addIngredient(a, "large eggs");
    const dijon = await addIngredient(a, "Dijon mustard", "level");
    const grain = await addIngredient(a, "whole-grain mustard", "level");

    const result = await t.mutation(api.agent.recipesUpsert, {
      ...a.agent,
      name: "Deviled eggs",
      instructions: ["Boil", "Mash", "Fill"],
      tags: [],
      yield: { quantityText: "12", unit: "halves" },
      ingredients: [
        { name: "eggs", quantityText: "6", unit: "each" },
        { name: "mustard", quantityText: "1", unit: "tsp" },
        { name: "smoked paprika", quantityText: "", unit: "pinch", optional: true },
        { name: "Smoked Paprika", quantityText: "1", unit: "pinch" },
      ],
    });

    // Only an exact, case, alias, or plural match resolves. "eggs" beside "large eggs" is a
    // candidate, never a guess.
    const created = Object.fromEntries(result.createdIngredients.map((c) => [c.name, c]));
    expect(Object.keys(created).sort()).toEqual(["eggs", "mustard", "smoked paprika"]);
    expect(created.mustard.candidates.map((c) => c.ingredientId).sort()).toEqual(
      [dijon, grain].sort(),
    );
    expect(created.eggs.candidates.map((c) => c.ingredientId)).toEqual([eggs]);
    expect(created["smoked paprika"].candidates).toEqual([]);

    const ingredients = await a.as.query(api.ingredients.list, {});
    const mustard = ingredients.find((i) => i._id === created.mustard.ingredientId);
    expect(mustard).toMatchObject({
      name: "mustard",
      kind: "count",
      category: "other",
      tracked: true,
      needsReview: true,
    });

    const recipe = await a.as.query(api.recipes.get, { id: result.recipeId });
    expect(recipe?.needsReview).toBe(true);
    // The repeated "Smoked Paprika" row reuses the ingredient made one row earlier.
    expect(recipe?.ingredients.map((r) => [r.ingredientName, r.needsReview])).toEqual([
      ["eggs", true],
      ["mustard", true],
      ["smoked paprika", true],
      ["smoked paprika", true],
    ]);
  });

  it("uses a resolved ingredient as is and leaves the recipe unflagged", async () => {
    const t = convexTest(schema, modules);
    const a = await householdWithToken(t, "Ana");
    const eggs = await addIngredient(a, "eggs");
    const result = await t.mutation(api.agent.recipesUpsert, {
      ...a.agent,
      name: "Boiled eggs",
      instructions: [],
      tags: [],
      ingredients: [{ name: "Eggs", quantityText: "2", unit: "each" }],
    });
    expect(result.createdIngredients).toEqual([]);
    const recipe = await a.as.query(api.recipes.get, { id: result.recipeId });
    expect(recipe?.needsReview).toBe(false);
    expect(recipe?.ingredients).toMatchObject([
      { ingredientId: eggs, quantityText: "2", quantityDecimal: 2, needsReview: false },
    ]);
  });
});
