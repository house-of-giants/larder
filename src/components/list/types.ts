import type { Id } from "../../../convex/_generated/dataModel";

// Client-side shape of `api.lists.current`, per the Phase 3 contract. Once the typed
// query lands these can be derived with `FunctionReturnType`; until then they are the
// contract the store screen is built against.

export type ListStatus = "needed" | "checked" | "skipped" | "onHand";

export type ListItem = {
  _id: Id<"listItems">;
  source: "plan" | "adhoc";
  displayName: string;
  kind?: "count" | "level";
  required: { quantityText: string; unit: string };
  purchase?: { quantityText: string; unit: string; note?: string };
  status: ListStatus;
  checkedAt?: number;
  storeTag?: string;
  sourceRecipeIds: Id<"recipes">[];
};

export type ListSection = { category: string; items: ListItem[] };

export type CurrentList = {
  listId: Id<"lists">;
  weekId: Id<"weeks">;
  /** Not in the contract yet; shown in the header when the query provides it. */
  weekOf?: string;
  status: "draft" | "active" | "complete";
  sections: ListSection[];
};
