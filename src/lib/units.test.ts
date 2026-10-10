import { describe, expect, it } from "vitest";
import { pluralUnit } from "./units";

describe("pluralUnit", () => {
  it("pluralises a count unit when there is more than one", () => {
    expect(pluralUnit("2", "sprig")).toBe("sprigs");
    expect(pluralUnit("4", "cup")).toBe("cups");
    expect(pluralUnit("10", "slice")).toBe("slices");
    expect(pluralUnit("8", "biscuit")).toBe("biscuits");
    expect(pluralUnit("3", "clove")).toBe("cloves");
  });

  it("pluralises a mixed number above one", () => {
    expect(pluralUnit("1 1/2", "cup")).toBe("cups");
    expect(pluralUnit("2.5", "cup")).toBe("cups");
  });

  it("keeps exactly one singular", () => {
    expect(pluralUnit("1", "sprig")).toBe("sprig");
    expect(pluralUnit("1.0", "cup")).toBe("cup");
  });

  it("keeps a fraction under one as the cook says it", () => {
    expect(pluralUnit("1/2", "cup")).toBe("cup");
    expect(pluralUnit("1/4", "slice")).toBe("slice");
  });

  it("leaves weights, spoons and the like as written", () => {
    for (const unit of ["lb", "oz", "g", "kg", "ml", "l", "tbsp", "tsp", "each", "pinch", "dash"]) {
      expect(pluralUnit("3", unit)).toBe(unit);
    }
  });

  it("leaves a unit that already ends in s", () => {
    expect(pluralUnit("2", "leaves")).toBe("leaves");
    expect(pluralUnit("3", "cups")).toBe("cups");
  });

  it("leaves the unit alone when the amount is words, not a number", () => {
    expect(pluralUnit("as needed", "cup")).toBe("cup");
    expect(pluralUnit("a few", "sprig")).toBe("sprig");
  });

  it("follows English endings and the case it was given", () => {
    expect(pluralUnit("2", "bunch")).toBe("bunches");
    expect(pluralUnit("2", "box")).toBe("boxes");
    expect(pluralUnit("2", "berry")).toBe("berries");
    expect(pluralUnit("2", "Cup")).toBe("Cups");
  });

  it("pluralises only the last word of a phrase unit", () => {
    expect(pluralUnit("2", "large can")).toBe("large cans");
  });

  it("says nothing for an empty unit", () => {
    expect(pluralUnit("3", "")).toBe("");
  });
});
