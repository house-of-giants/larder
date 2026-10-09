import { anyApi, type FunctionReference } from "convex/server";
import type { Id } from "../../../convex/_generated/dataModel";
import type { CurrentList, ListStatus } from "./types";

// The one place store mode touches Convex. `convex/lists.ts` lands from the other
// Phase 3 lane; until it does, these are untyped `anyApi` references pinned to the
// contract's types. After the merge, swap each for `api.lists.*` and let tsc confirm the
// contract held.

export const currentList = anyApi.lists.current as FunctionReference<
  "query",
  "public",
  Record<string, never>,
  CurrentList | null
>;

export const setItemStatus = anyApi.lists.setItemStatus as FunctionReference<
  "mutation",
  "public",
  { listItemId: Id<"listItems">; status: ListStatus; at?: number },
  unknown
>;

export const addItem = anyApi.lists.addItem as FunctionReference<
  "mutation",
  "public",
  { displayName: string; quantityText?: string; unit?: string; category?: string },
  unknown
>;
