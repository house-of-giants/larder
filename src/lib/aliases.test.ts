import { describe, expect, it } from "vitest";
import seedIngredients from "../../convex/seed/ingredients.json";
import { normalizeName, resolveIngredient, singularize, suggestIngredients } from "#/lib/aliases";

// The seed dictionary, keyed by name so a match reads as the ingredient it found.
const dictionary = seedIngredients.map((i) => ({ _id: i.name, name: i.name, aliases: i.aliases }));

describe("normalizeName", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeName("  Large\t  Eggs ")).toBe("large eggs");
  });

  it("composes accents so typed and pasted forms agree", () => {
    expect(normalizeName("Gruyère")).toBe("gruyère");
  });

  it.each([
    ["Parmesan, grated", "parmesan"],
    ["pecans, chopped", "pecans"],
    ["pepper jack cheese, shredded", "pepper jack cheese"],
    ["garlic, minced", "garlic"],
    ["butter , softened", "butter"],
  ])("drops the preparation in %j", (raw, expected) => {
    expect(normalizeName(raw)).toBe(expected);
  });

  it.each([
    ["whole-grain or Dijon mustard", "whole-grain or dijon mustard"],
    ["beef, ground", "beef, ground"],
    ["elk italian sausage, already in freezer", "elk italian sausage, already in freezer"],
  ])("keeps a clause that is not a preparation in %j", (raw, expected) => {
    expect(normalizeName(raw)).toBe(expected);
  });
});

describe("singularize", () => {
  it.each([
    ["potatoes", "potato"],
    ["tomatoes", "tomato"],
    ["eggs", "egg"],
    ["onions", "onion"],
    ["cloves", "clove"],
    ["berries", "berry"],
    ["large eggs", "large egg"],
    ["glass", "glass"],
    ["asparagus", "asparagus"],
    ["egg", "egg"],
  ])("%s -> %s", (plural, singular) => {
    expect(singularize(plural)).toBe(singular);
  });
});

describe("resolveIngredient against the seed dictionary", () => {
  it.each([
    ["large eggs", "large eggs", "exact"],
    ["large egg", "large eggs", "alias"],
    ["yellow onions", "yellow onion", "alias"],
    ["Parmesan, grated", "Parmesan", "case"],
    ["garlic clove", "garlic cloves", "alias"],
    ["elk sausage", "elk Italian sausage", "alias"],
    ["lean ground beef", "ground beef", "alias"],
    ["whole-grain or Dijon mustard", "whole-grain mustard", "alias"],
    ["Dijon", "Dijon mustard", "alias"],
    ["dijon mustard", "Dijon mustard", "case"],
    ["rosemary", "fresh rosemary", "alias"],
    ["apples", "crisp apples", "alias"],
    ["sweet potato", "sweet potatoes", "alias"],
    ["hawaiian roll", "Hawaiian rolls", "plural"],
    ["pecan", "pecans", "plural"],
    ["yellow onion", "yellow onion", "exact"],
  ])("%j -> %s (%s)", (query, ingredientId, how) => {
    expect(resolveIngredient(query, dictionary)).toEqual({ kind: "match", ingredientId, how });
  });

  it("offers both mustards for plain mustard and merges neither", () => {
    const result = resolveIngredient("mustard", dictionary);
    expect(result.kind).toBe("none");
    if (result.kind !== "none") return;
    expect(result.candidates).toEqual(
      expect.arrayContaining(["Dijon mustard", "whole-grain mustard"]),
    );
    expect(result.candidates).toHaveLength(2);
  });

  it("never merges a near spelling", () => {
    expect(resolveIngredient("dijonn mustard", dictionary)).toMatchObject({ kind: "none" });
    expect(resolveIngredient("rosemarie", dictionary)).toEqual({ kind: "none", candidates: [] });
  });

  it("caps candidates at five", () => {
    const result = resolveIngredient("cheese", dictionary);
    expect(result.kind).toBe("none");
    if (result.kind !== "none") return;
    expect(result.candidates.length).toBe(5);
  });

  it("finds nothing for an empty name", () => {
    expect(resolveIngredient("   ", dictionary)).toEqual({ kind: "none", candidates: [] });
  });

  it("refuses to pick when two ingredients claim the same alias", () => {
    const twins = [
      { _id: "a", name: "sea salt", aliases: ["salt"] },
      { _id: "b", name: "kosher salt", aliases: ["salt"] },
    ];
    expect(resolveIngredient("salt", twins)).toEqual({ kind: "none", candidates: ["a", "b"] });
  });
});

describe("suggestIngredients", () => {
  it("offers words as they are being typed", () => {
    expect(suggestIngredients("must", dictionary)).toEqual([
      "Dijon mustard",
      "whole-grain mustard",
    ]);
    expect(suggestIngredients("ground be", dictionary)).toEqual(["ground beef"]);
  });

  it("puts the resolver's match first, then other ingredients that start the same way", () => {
    const suggested = suggestIngredients("pepper", dictionary);
    expect(suggested[0]).toBe("black pepper");
    expect(suggested).toEqual(
      expect.arrayContaining(["pepper jack cheese", "sliced pepperoni", "sliced pepperoncini"]),
    );
    expect(new Set(suggested).size).toBe(suggested.length);
  });

  it("keeps the resolver's candidates when there is no match", () => {
    expect(suggestIngredients("mustard", dictionary)).toEqual([
      "Dijon mustard",
      "whole-grain mustard",
    ]);
  });

  it("does not match inside a word", () => {
    expect(suggestIngredients("ustard", dictionary)).toEqual([]);
  });

  it("stops at the limit", () => {
    expect(suggestIngredients("c", dictionary, 4)).toHaveLength(4);
  });

  it("suggests nothing for a blank name", () => {
    expect(suggestIngredients("  ", dictionary)).toEqual([]);
  });
});
