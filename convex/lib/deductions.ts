import { type Level, stepDown } from "../../src/lib/levels";

// What one cook takes out of the pantry, from plain data: the recipe's rows, the
// multiplier, what the cook skipped or swapped, the household's ingredients, and the
// pantry. No Convex types and no I/O, so the seeded sliders can be checked by hand.
//
// Counts deduct `quantityDecimal x multiplier` in the pantry's own unit and floor at zero;
// a row in another unit, or with no number ("as needed"), deducts nothing. Levels step down
// once per cook, however much the recipe uses and however many rows name them. No unit
// conversion, ever.

export type DeductionRow<I extends string> = {
  ingredientId: I;
  /** Null when the recipe's words carry no number ("as needed", "1 knob"). */
  quantityDecimal: number | null;
  unit: string;
  /** The pantry ingredient this row really uses up (egg yolk -> large eggs). */
  deductionIngredientId?: I;
};

export type DeductionIngredient = { kind: "count" | "level"; tracked: boolean };

export type DeductionPantryRow = {
  count?: { quantityDecimal: number; unit: string };
  level?: Level;
};

export type DeductionSubstitution<I extends string> = {
  ingredientId: I;
  /** Absent: swapped for something the pantry does not keep, so nothing deducts. */
  replacementIngredientId?: I;
};

export type DeductionInput<I extends string> = {
  ingredients: readonly DeductionRow<I>[];
  multiplier: number;
  /** Recipe-row ingredient ids the cook left out. */
  skipped: ReadonlySet<I>;
  substitutions: readonly DeductionSubstitution<I>[];
  dictionary: ReadonlyMap<I, DeductionIngredient>;
  pantry: ReadonlyMap<I, DeductionPantryRow>;
};

export type CountDeduction<I extends string> = {
  ingredientId: I;
  kind: "count";
  /** The pantry's unit, or the recipe's when the pantry has no count. */
  unit: string;
  /** Null when the pantry has no count for it. */
  before: number | null;
  after: number | null;
  /** What the recipe called for in `unit`; null when no row could be counted. */
  used: number | null;
  /** The pantry had less than the recipe used. */
  wentNegative: boolean;
  /** Why nothing was taken off a count the pantry does hold. */
  note?: "no decimal" | "unit mismatch";
};

export type LevelDeduction<I extends string> = {
  ingredientId: I;
  kind: "level";
  before: Level | null;
  after: Level | null;
  /** It was already out. */
  wentNegative: boolean;
};

export type Deduction<I extends string> = CountDeduction<I> | LevelDeduction<I>;

// Float noise from fractions (1/3 x 3) is not a shortage.
const epsilon = 1e-9;

export function planDeductions<I extends string>(input: DeductionInput<I>): Deduction<I>[] {
  const swaps = new Map(input.substitutions.map((s) => [s.ingredientId, s]));

  // Rows grouped by the pantry ingredient they come out of, in recipe order.
  const groups = new Map<I, DeductionRow<I>[]>();
  for (const row of input.ingredients) {
    if (input.skipped.has(row.ingredientId)) continue;
    const swap = swaps.get(row.ingredientId);
    const target =
      swap !== undefined
        ? swap.replacementIngredientId
        : (row.deductionIngredientId ?? row.ingredientId);
    if (target === undefined) continue;
    if (input.dictionary.get(target)?.tracked !== true) continue;
    const group = groups.get(target) ?? [];
    group.push(row);
    groups.set(target, group);
  }

  const plan: Deduction<I>[] = [];
  for (const [ingredientId, rows] of groups) {
    const ingredient = input.dictionary.get(ingredientId)!;
    const pantry = input.pantry.get(ingredientId);
    if (ingredient.kind === "level") {
      const before = pantry?.level ?? null;
      plan.push({
        ingredientId,
        kind: "level",
        before,
        after: before === null ? null : stepDown(before),
        wentNegative: before === "out",
      });
      continue;
    }
    plan.push(countDeduction(ingredientId, rows, input.multiplier, pantry?.count));
  }
  return plan;
}

function countDeduction<I extends string>(
  ingredientId: I,
  rows: DeductionRow<I>[],
  multiplier: number,
  count: DeductionPantryRow["count"],
): CountDeduction<I> {
  const unit = (count?.unit ?? rows[0].unit).trim();
  let used: number | null = null;
  let note: CountDeduction<I>["note"];
  for (const row of rows) {
    if (row.quantityDecimal === null) {
      note ??= "no decimal";
    } else if (row.unit.trim() !== unit) {
      note ??= "unit mismatch";
    } else {
      used = (used ?? 0) + row.quantityDecimal * multiplier;
    }
  }

  if (count === undefined) {
    return {
      ingredientId,
      kind: "count",
      unit,
      before: null,
      after: null,
      used,
      wentNegative: false,
    };
  }
  const before = count.quantityDecimal;
  if (used === null) {
    return {
      ingredientId,
      kind: "count",
      unit,
      before,
      after: before,
      used,
      wentNegative: false,
      note,
    };
  }
  const raw = before - used;
  return {
    ingredientId,
    kind: "count",
    unit,
    before,
    after: raw < epsilon ? 0 : raw,
    used,
    wentNegative: raw < -epsilon,
  };
}
