import { levelLabels } from "./labels";
import type { PantryAmount } from "#/lib/pantry-amount";

/**
 * What a pantry row says under the name: the amount in the household's words for a count
 * ("10 slices"), the word for a level ("Half"), or out. Both go tomato but out, which is
 * quiet ink.
 */
export type ShelfLine =
  | { kind: "amount"; quantityText: string; unit: string }
  | { kind: "level"; word: string }
  | { kind: "out" };

export function shelfLine(row: PantryAmount): ShelfLine {
  if (row.kind === "count") {
    if (row.count.quantityDecimal === 0) return { kind: "out" };
    return { kind: "amount", quantityText: row.count.quantityText, unit: row.count.unit };
  }
  if (row.level === "out") return { kind: "out" };
  return { kind: "level", word: levelLabels[row.level] };
}
