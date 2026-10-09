import type { Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { inventoryActor, inventoryEventType, inventoryRefs } from "../schema";

// The inventory ledger.
//
// Every write that changes what the household has (pantry counts and levels, list
// check-offs that become pantry, cooking deductions, leftovers eaten or tossed, the weekly
// closeout) does two things in the same mutation:
//
//   1. patch the view row (pantryItems, listItems, preparedFoods, ...), and
//   2. call `recordInventoryEvent` with a before/after snapshot in `payload`.
//
// Convex runs a mutation as one transaction, so the view and the ledger never disagree:
// either both land or neither does. Undo (Phase 4) reads the snapshot back and writes an
// `undo` event that points at the original through `undoesEventId`.

export type InventoryEventInput = {
  householdId: Id<"households">;
  type: Infer<typeof inventoryEventType>;
  actor: Infer<typeof inventoryActor>;
  refs: Infer<typeof inventoryRefs>;
  payload: unknown;
  undoesEventId?: Id<"inventoryEvents">;
};

export async function recordInventoryEvent(
  ctx: MutationCtx,
  event: InventoryEventInput,
): Promise<Id<"inventoryEvents">> {
  return await ctx.db.insert("inventoryEvents", { ...event, at: Date.now() });
}
