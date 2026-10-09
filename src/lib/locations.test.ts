import { describe, expect, it } from "vitest";
import { LOCATIONS, defaultLocation } from "#/lib/locations";

describe("LOCATIONS", () => {
  it("puts the fridge first and the counter last", () => {
    expect(LOCATIONS).toEqual(["fridge", "freezer", "pantry", "counter"]);
  });
});

describe("defaultLocation", () => {
  it.each([
    ["meat_deli", "fridge"],
    ["dairy_refrigerated", "fridge"],
    ["produce", "pantry"],
    ["dry_goods", "pantry"],
    ["baking_pantry_condiments", "pantry"],
    ["something new", "pantry"],
  ])("puts %s in the %s", (category, location) => {
    expect(defaultLocation(category)).toBe(location);
  });
});
