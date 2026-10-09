import type { Level } from "#/lib/levels";
import type { Location } from "#/lib/locations";

export const locationLabels: Record<Location, string> = {
  fridge: "Fridge",
  freezer: "Freezer",
  pantry: "Pantry",
  counter: "Counter",
};

export const levelLabels: Record<Level, string> = {
  full: "Full",
  half: "Half",
  low: "Low",
  out: "Out",
};

/** Store sections, in the order the seed and the list use them. */
export const categoryLabels: Record<string, string> = {
  produce: "Produce",
  meat_deli: "Meat and deli",
  dairy_refrigerated: "Dairy and refrigerated",
  bread_canned_jarred: "Bread, cans, and jars",
  dry_goods: "Dry goods",
  baking_pantry_condiments: "Baking, spices, and condiments",
  other: "Other",
};
