import { describe, expect, it } from "vitest";
import { addSameUnit, formatQuantity, parseQuantity } from "#/lib/quantities";

describe("parseQuantity", () => {
  it.each([
    ["12", 12],
    ["1/2", 0.5],
    ["2 1/2", 2.5],
    ["1.5", 1.5],
    ["0.25", 0.25],
    ["  3  ", 3],
    ["½", 0.5],
    ["¼", 0.25],
    ["¾", 0.75],
    ["⅛", 0.125],
    ["1½", 1.5],
    ["2 ¾", 2.75],
  ])("reads %j as %d", (text, expected) => {
    expect(parseQuantity(text)).toBe(expected);
  });

  it.each([
    ["⅓", 1 / 3],
    ["⅔", 2 / 3],
    ["1 ⅓", 4 / 3],
  ])("reads the thirds in %j", (text, expected) => {
    expect(parseQuantity(text)).toBeCloseTo(expected, 10);
  });

  it.each(["as needed", "1 knob", "", "   ", "a pinch", "1/0", "2 1/2 3", "1..5", "-1", "1/2/3"])(
    "has no number for %j",
    (text) => {
      expect(parseQuantity(text)).toBeNull();
    },
  );
});

describe("parseQuantity overflow", () => {
  it.each([
    ["9".repeat(400)],
    [`${"9".repeat(400)}/1`],
    [`1 ${"9".repeat(400)}/1`],
    [`${"9".repeat(400)} ½`],
  ])("has no number for a value too large to hold (%#)", (text) => {
    expect(parseQuantity(text)).toBeNull();
  });
});

describe("formatQuantity", () => {
  it.each([[Number.POSITIVE_INFINITY], [Number.NEGATIVE_INFINITY], [Number.NaN]])(
    "writes nothing for %d",
    (decimal) => {
      expect(formatQuantity(decimal)).toBe("");
    },
  );

  it.each([
    [22, "22"],
    [0, "0"],
    [1.5, "1 1/2"],
    [0.5, "1/2"],
    [0.3333, "1/3"],
    [2 / 3, "2/3"],
    [0.125, "1/8"],
    [0.75, "3/4"],
    [2.375, "2 3/8"],
    [1.37, "1.37"],
    [1.375, "1 3/8"],
    [0.1, "0.1"],
    [1.234, "1.23"],
    [1.999, "2"],
  ])("writes %d as %j", (decimal, expected) => {
    expect(formatQuantity(decimal)).toBe(expected);
  });

  it("round-trips what it writes", () => {
    for (const text of ["1/2", "1 1/2", "2/3", "3/8", "22"]) {
      expect(formatQuantity(parseQuantity(text) ?? Number.NaN)).toBe(text);
    }
  });
});

describe("addSameUnit", () => {
  it("adds two halves of a cup to one cup", () => {
    expect(
      addSameUnit({ quantityDecimal: 0.5, unit: "cup" }, { quantityDecimal: 0.5, unit: "cup" }),
    ).toEqual({ quantityDecimal: 1, unit: "cup" });
  });

  it("matches units after trimming", () => {
    expect(
      addSameUnit({ quantityDecimal: 2, unit: " lb" }, { quantityDecimal: 1, unit: "lb " }),
    ).toEqual({ quantityDecimal: 3, unit: "lb" });
  });

  it("refuses tablespoons plus teaspoons", () => {
    expect(
      addSameUnit({ quantityDecimal: 1, unit: "tbsp" }, { quantityDecimal: 1, unit: "tsp" }),
    ).toBeNull();
  });

  it("treats units as case-sensitive", () => {
    expect(
      addSameUnit({ quantityDecimal: 1, unit: "Cup" }, { quantityDecimal: 1, unit: "cup" }),
    ).toBeNull();
  });
});
