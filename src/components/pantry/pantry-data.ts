import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type PantryRowData = FunctionReturnType<typeof api.pantry.list>[number];

/** A count at zero or a level at out. */
export function isOut(row: Pick<PantryRowData, "kind" | "count" | "level">): boolean {
  return row.kind === "count" ? row.count?.quantityDecimal === 0 : row.level === "out";
}
