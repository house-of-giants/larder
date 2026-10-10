import type { Level } from "./levels";

/** What a pantry row holds: a count or a level, never both (the table is a union on kind). */
export type PantryAmount =
  | { kind: "count"; count: { quantityText: string; quantityDecimal: number; unit: string } }
  | { kind: "level"; level: Level };

/** The row's count; undefined for a level row or no row. */
export function countOf(row: PantryAmount | null | undefined) {
  return row?.kind === "count" ? row.count : undefined;
}

/** The row's level; undefined for a count row or no row. */
export function levelOf(row: PantryAmount | null | undefined) {
  return row?.kind === "level" ? row.level : undefined;
}
