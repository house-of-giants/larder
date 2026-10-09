// The number behind a recipe's quantity words, for math only; the words stay on screen.
// "12" -> 12, "1.5" -> 1.5, "1/2" -> 0.5, "2 1/2" -> 2.5. Anything else ("as needed",
// "1-2", "a knob") has no number and returns undefined.
//
// Convex functions cannot import from src/, so this is a local copy of the shape the
// app-side parser in src/lib/quantities.ts handles. Reconcile the two after Phase 2 merges.

const whole = String.raw`\d+`;
const decimal = String.raw`\d+\.\d+|\.\d+`;
const fraction = String.raw`(\d+)/(\d+)`;

const decimalPattern = new RegExp(`^(?:${decimal}|${whole})$`);
const fractionPattern = new RegExp(`^${fraction}$`);
const mixedPattern = new RegExp(`^(${whole})\\s+${fraction}$`);

export function quantityDecimal(text: string): number | undefined {
  const t = text.trim();
  if (decimalPattern.test(t)) return Number(t);

  const f = fractionPattern.exec(t);
  if (f) return ratio(f[1], f[2]);

  const m = mixedPattern.exec(t);
  if (m) {
    const part = ratio(m[2], m[3]);
    return part === undefined ? undefined : Number(m[1]) + part;
  }
  return undefined;
}

function ratio(numerator: string, denominator: string): number | undefined {
  const d = Number(denominator);
  return d === 0 ? undefined : Number(numerator) / d;
}
