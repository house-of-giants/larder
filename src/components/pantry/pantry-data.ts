import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { PantryAmount } from "#/lib/pantry-amount";

export type PantryRowData = FunctionReturnType<typeof api.pantry.list>[number];

/** A count at zero or a level at out. */
export function isOut(row: PantryAmount): boolean {
  return row.kind === "count" ? row.count.quantityDecimal === 0 : row.level === "out";
}
