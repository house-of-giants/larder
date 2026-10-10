import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { type Adaptation, adaptationShort, fridgeLine } from "./labels";

describe("fridgeLine", () => {
  it("says the fridge is empty with nothing in it", () => {
    expect(fridgeLine(0)).toBe("fridge empty");
  });

  it("counts what is in the fridge", () => {
    expect(fridgeLine(1)).toBe("1 in the fridge");
    expect(fridgeLine(3)).toBe("3 in the fridge");
  });
});

const adaptation = (overrides: Partial<Adaptation>): Adaptation => ({
  _id: "a1" as Id<"weekAdaptations">,
  recipeId: "r1" as Id<"recipes">,
  kind: "replace",
  description: "",
  originalIngredientId: undefined,
  originalName: undefined,
  newIngredientId: undefined,
  newName: undefined,
  quantityText: undefined,
  quantityDecimal: undefined,
  unit: undefined,
  ...overrides,
});

describe("adaptationShort", () => {
  it("names what was swapped in", () => {
    const swap = adaptation({
      kind: "replace",
      originalName: "smoked chicken sausage",
      newName: "elk Italian sausage",
      quantityText: "2",
      unit: "lb",
    });
    expect(adaptationShort(swap)).toBe("elk Italian sausage swapped in");
  });

  it("names what was left out", () => {
    expect(adaptationShort(adaptation({ kind: "remove", originalName: "raisins" }))).toBe(
      "raisins left out",
    );
  });

  it("names what was added", () => {
    expect(adaptationShort(adaptation({ kind: "add", newName: "spinach" }))).toBe("spinach added");
  });

  it("names an ingredient whose amount changed", () => {
    expect(
      adaptationShort(adaptation({ kind: "adjust", originalName: "garlic", quantityText: "6" })),
    ).toBe("garlic changed");
  });

  it("says an ingredient when the name is gone", () => {
    expect(adaptationShort(adaptation({ kind: "replace" }))).toBe("an ingredient swapped in");
  });
});
