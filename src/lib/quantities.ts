// Quantities keep the recipe's words on screen ("1 1/2", "as needed") and carry a number
// for math beside them. This module turns words into that number and back. It never
// converts units: two amounts add only when their units are the same string.

export type SameUnitQuantity = { quantityDecimal: number; unit: string };

const vulgarFractions: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};

const decimalPattern = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const fractionPattern = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/;
const vulgarPattern = new RegExp(`^(?:(\\d+)\\s*)?([${Object.keys(vulgarFractions).join("")}])$`);

/**
 * The number in a recipe amount: "12", "1/2", "2 1/2", "1.5", "½", "1 ⅓". Anything else
 * ("as needed", "1 knob", "a pinch", "") has no number and returns null.
 */
export function parseQuantity(text: string): number | null {
  const s = text.trim();
  if (decimalPattern.test(s)) return Number(s);

  const fraction = fractionPattern.exec(s);
  if (fraction) {
    const [, whole, numerator, denominator] = fraction;
    if (Number(denominator) === 0) return null;
    return Number(whole ?? 0) + Number(numerator) / Number(denominator);
  }

  const vulgar = vulgarPattern.exec(s);
  if (vulgar) {
    const [, whole, symbol] = vulgar;
    return Number(whole ?? 0) + vulgarFractions[symbol];
  }

  return null;
}

const denominators = [2, 3, 4, 8] as const;
// Close enough to call a fraction exact: 0.3333 is a third, 1.37 is not 1 3/8.
const tolerance = 1e-3;

/**
 * The shortest way to write a number the way a recipe would: a whole number or a mixed
 * number over 2, 3, 4, or 8 ("1 1/2", "1/3"), else up to two decimals ("1.37").
 */
export function formatQuantity(decimal: number): string {
  if (decimal < 0) return `-${formatQuantity(-decimal)}`;
  const whole = Math.floor(decimal);
  const rest = decimal - whole;
  for (const denominator of denominators) {
    const numerator = Math.round(rest * denominator);
    if (Math.abs(rest - numerator / denominator) >= tolerance) continue;
    if (numerator === 0) return String(whole);
    if (numerator === denominator) return String(whole + 1);
    const fraction = `${numerator}/${denominator}`;
    return whole === 0 ? fraction : `${whole} ${fraction}`;
  }
  return String(Number(decimal.toFixed(2)));
}

/** a + b when both carry the same unit (exact, after trimming); null otherwise. */
export function addSameUnit(a: SameUnitQuantity, b: SameUnitQuantity): SameUnitQuantity | null {
  const unit = a.unit.trim();
  if (unit !== b.unit.trim()) return null;
  return { quantityDecimal: a.quantityDecimal + b.quantityDecimal, unit };
}
