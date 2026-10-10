import { describe, expect, it } from "vitest";
import { amountTone } from "#/lib/amount";

// DESIGN.md, the Amount Rule: an amount with a number is set in tomato; the recipe's own
// words with no number ("as needed") stay in quiet ink.
describe("amountTone", () => {
  it("sets a figure in the accent: whole, decimal, fraction, mixed, vulgar", () => {
    const figures = ["3", "16", "1.5", "1/2", "1 1/2", "½", "2 ½"];
    expect(figures.map(amountTone)).toEqual(figures.map(() => "accent"));
  });

  it("keeps the recipe's words quiet when there is no number", () => {
    const words = ["as needed", "to taste", "a pinch", ""];
    expect(words.map(amountTone)).toEqual(words.map(() => "quiet"));
  });

  it("ignores the spaces around a figure", () => {
    expect(amountTone("  2 ")).toBe("accent");
  });
});
