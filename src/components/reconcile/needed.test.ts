import { describe, expect, it } from "vitest";
import { amountNeededText, neededParts } from "./needed";

describe("amountNeededText", () => {
  it("reads one amount as the sentence the reconcile row shows", () => {
    expect(amountNeededText([{ quantityText: "22", unit: "tbsp" }])).toBe(
      "The week needs 22 tbsp",
    );
  });

  it("joins split units with 'and'", () => {
    expect(
      amountNeededText([
        { quantityText: "1", unit: "tbsp" },
        { quantityText: "2", unit: "tsp" },
      ]),
    ).toBe("The week needs 1 tbsp and 2 tsp");
  });

  it("leaves 'each' off a plain count and keeps the recipe's words", () => {
    expect(amountNeededText([{ quantityText: "3", unit: "each" }])).toBe("The week needs 3");
    expect(amountNeededText([{ quantityText: "1 1/2", unit: "cup" }])).toBe(
      "The week needs 1 1/2 cup",
    );
  });
});

describe("neededParts", () => {
  it("keeps each amount whole so the row can set it in tomato", () => {
    expect(
      neededParts([
        { quantityText: "1", unit: "tbsp" },
        { quantityText: "2", unit: "tsp" },
      ]),
    ).toEqual([
      { text: "The week needs " },
      { amount: { quantityText: "1", unit: "tbsp" } },
      { text: " and " },
      { amount: { quantityText: "2", unit: "tsp" } },
    ]);
  });
});
