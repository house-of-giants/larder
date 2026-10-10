import { describe, expect, it } from "vitest";
import { shelfLine } from "./shelf-line";

const count = (quantityText: string, quantityDecimal: number, unit: string) =>
  ({ kind: "count", count: { quantityText, quantityDecimal, unit } }) as const;

describe("shelfLine: the pantry row's second line", () => {
  it("gives a count its amount in the household's own words", () => {
    expect(shelfLine(count("10", 10, "slice"))).toEqual({
      kind: "amount",
      quantityText: "10",
      unit: "slice",
    });
  });

  it("keeps a fraction as written, not its decimal", () => {
    expect(shelfLine(count("1 1/2", 1.5, "lb"))).toEqual({
      kind: "amount",
      quantityText: "1 1/2",
      unit: "lb",
    });
  });

  it("says out for a count at zero", () => {
    expect(shelfLine(count("0", 0, "slice"))).toEqual({ kind: "out" });
  });

  it("gives a level its word", () => {
    expect(shelfLine({ kind: "level", level: "half" })).toEqual({ kind: "level", word: "Half" });
    expect(shelfLine({ kind: "level", level: "low" })).toEqual({ kind: "level", word: "Low" });
  });

  it("says out for a level at out, not the word Out in tomato", () => {
    expect(shelfLine({ kind: "level", level: "out" })).toEqual({ kind: "out" });
  });
});
