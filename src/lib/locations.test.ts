import { describe, expect, it } from "vitest";
import { defaultLocation } from "#/lib/locations";

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
