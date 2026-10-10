import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { createHousehold, type Test } from "./test_helpers";

const modules = import.meta.glob("./**/*.ts");
const newTest = (): Test => convexTest(schema, modules);

const mustard = {
  kind: "level" as const,
  category: "baking_pantry_condiments",
  tracked: true,
};

describe("ingredients.upsert", () => {
  it("creates a trimmed ingredient and lists it by name", async () => {
    const t = newTest();
    const { as, householdId } = await createHousehold(t, { who: "Alice", name: "Elm" });

    await as.mutation(api.ingredients.upsert, {
      name: "  whole-grain mustard ",
      aliases: [" grainy mustard ", "", "Grainy Mustard"],
      ...mustard,
    });
    await as.mutation(api.ingredients.upsert, { name: "Dijon mustard", aliases: [], ...mustard });

    const listed = await as.query(api.ingredients.list, {});
    expect(listed.map((i) => [i.name, i.aliases, i.householdId, i.needsReview])).toEqual([
      ["Dijon mustard", [], householdId, false],
      ["whole-grain mustard", ["grainy mustard"], householdId, false],
    ]);
  });

  it("rejects an empty name", async () => {
    const t = newTest();
    const { as } = await createHousehold(t, { who: "Alice", name: "Elm" });
    await expect(
      as.mutation(api.ingredients.upsert, { name: "  ", aliases: [], ...mustard }),
    ).rejects.toMatchObject({ data: "Give the ingredient a name." });
    await expect(as.query(api.ingredients.list, {})).resolves.toEqual([]);
  });

  it("rejects a name another ingredient already has, in any case or spacing", async () => {
    const t = newTest();
    const { as } = await createHousehold(t, { who: "Alice", name: "Elm" });
    await as.mutation(api.ingredients.upsert, { name: "Dijon mustard", aliases: [], ...mustard });
    await expect(
      as.mutation(api.ingredients.upsert, { name: " dijon   MUSTARD", aliases: [], ...mustard }),
    ).rejects.toMatchObject({ data: "Dijon mustard is already in the list." });
    await expect(as.query(api.ingredients.list, {})).resolves.toHaveLength(1);
  });

  it("lets an ingredient keep its own name on edit", async () => {
    const t = newTest();
    const { as } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const id = await as.mutation(api.ingredients.upsert, {
      name: "Dijon mustard",
      aliases: [],
      ...mustard,
    });
    await as.mutation(api.ingredients.upsert, {
      id,
      name: "dijon mustard",
      aliases: ["dijon"],
      ...mustard,
    });
    const got = await as.query(api.ingredients.get, { id });
    expect([got?.name, got?.aliases]).toEqual(["dijon mustard", ["dijon"]]);
  });

  it("allows the same name in two different households", async () => {
    const t = newTest();
    const a = await createHousehold(t, { who: "Alice", name: "A" });
    const b = await createHousehold(t, { who: "Bob", name: "B" });
    await a.as.mutation(api.ingredients.upsert, { name: "Dijon mustard", aliases: [], ...mustard });
    await b.as.mutation(api.ingredients.upsert, { name: "Dijon mustard", aliases: [], ...mustard });
    await expect(b.as.query(api.ingredients.list, {})).resolves.toHaveLength(1);
  });

  it("refuses to change the kind while a pantry row holds the old kind", async () => {
    const t = newTest();
    const { as } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const id = await as.mutation(api.ingredients.upsert, {
      name: "fresh ginger",
      aliases: [],
      ...mustard,
    });
    await as.mutation(api.pantry.setLevel, { ingredientId: id, level: "full", location: "fridge" });

    await expect(
      as.mutation(api.ingredients.upsert, {
        id,
        name: "fresh ginger",
        aliases: [],
        ...mustard,
        kind: "count",
      }),
    ).rejects.toMatchObject({ data: "Clear the pantry row first." });
    expect((await as.query(api.ingredients.get, { id }))?.kind).toBe("level");

    await as.mutation(api.pantry.remove, { ingredientId: id });
    await as.mutation(api.ingredients.upsert, {
      id,
      name: "fresh ginger",
      aliases: [],
      ...mustard,
      kind: "count",
    });
    expect((await as.query(api.ingredients.get, { id }))?.kind).toBe("count");
  });

  it("will not edit another household's ingredient", async () => {
    const t = newTest();
    const a = await createHousehold(t, { who: "Alice", name: "A" });
    const b = await createHousehold(t, { who: "Bob", name: "B" });
    const id = await a.as.mutation(api.ingredients.upsert, {
      name: "Dijon mustard",
      aliases: [],
      ...mustard,
    });
    await expect(
      b.as.mutation(api.ingredients.upsert, { id, name: "stolen", aliases: [], ...mustard }),
    ).rejects.toMatchObject({ data: "That ingredient is not in this household." });
    await expect(b.as.query(api.ingredients.get, { id })).resolves.toBeNull();
    expect((await a.as.query(api.ingredients.get, { id }))?.name).toBe("Dijon mustard");
  });
});

describe("ingredients.resolve", () => {
  it("matches the household's own name exactly or in other case and spacing, never another's", async () => {
    const t = newTest();
    const a = await createHousehold(t, { who: "Alice", name: "Elm" });
    const b = await createHousehold(t, { who: "Bob", name: "Oak" });
    const dijon = await a.as.mutation(api.ingredients.upsert, {
      name: "Dijon mustard",
      aliases: [],
      ...mustard,
    });
    await b.as.mutation(api.ingredients.upsert, { name: "dijon mustard", aliases: [], ...mustard });

    await expect(a.as.query(api.ingredients.resolve, { name: " Dijon mustard " })).resolves.toEqual(
      { kind: "match", ingredientId: dijon, name: "Dijon mustard", how: "exact" },
    );
    await expect(a.as.query(api.ingredients.resolve, { name: "DIJON  Mustard" })).resolves.toEqual({
      kind: "match",
      ingredientId: dijon,
      name: "Dijon mustard",
      how: "case",
    });
  });

  it("returns both mustards as candidates for plain mustard", async () => {
    const t = newTest();
    const { as } = await createHousehold(t, { who: "Alice", name: "Elm" });
    const dijon = await as.mutation(api.ingredients.upsert, {
      name: "Dijon mustard",
      aliases: ["dijon"],
      ...mustard,
    });
    const grain = await as.mutation(api.ingredients.upsert, {
      name: "whole-grain mustard",
      aliases: ["whole-grain or Dijon mustard"],
      ...mustard,
    });

    const result = await as.query(api.ingredients.resolve, { name: "mustard" });
    expect(result.kind).toBe("none");
    if (result.kind !== "none") return;
    expect([...result.candidates].sort((x, y) => x.name.localeCompare(y.name))).toEqual([
      { ingredientId: dijon, name: "Dijon mustard" },
      { ingredientId: grain, name: "whole-grain mustard" },
    ]);

    await expect(
      as.query(api.ingredients.resolve, { name: "whole-grain or Dijon mustard" }),
    ).resolves.toEqual({
      kind: "match",
      ingredientId: grain,
      name: "whole-grain mustard",
      how: "alias",
    });
  });
});
