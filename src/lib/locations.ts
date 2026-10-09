// Where things live in the kitchen, in the order the pantry screen shows them: the fridge
// first, because that is what people open the screen to check.

export const LOCATIONS = ["fridge", "freezer", "pantry", "counter"] as const;

export type Location = (typeof LOCATIONS)[number];

const coldCategories = new Set(["meat_deli", "dairy_refrigerated"]);

/** Where a new pantry row goes when nobody says: cold sections in the fridge. */
export function defaultLocation(category: string): Location {
  return coldCategories.has(category) ? "fridge" : "pantry";
}
