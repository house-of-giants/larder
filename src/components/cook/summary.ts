import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { amountText } from "#/components/recipes/recipe-text";
import { formatQuantity } from "#/lib/quantities";
import { pluralUnit } from "#/lib/units";

export type DeductionView = FunctionReturnType<typeof api.cooking.madeIt>["deductions"][number];
export type SummaryLine = { text: string; tone: "short" | "plain" | "quiet" };

const capitalized = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
const amount = (decimal: number, unit: string) => amountText(formatQuantity(decimal), unit);

/** One sentence for an ingredient the pantry holds; null for one it does not. */
function lineOf(d: DeductionView): SummaryLine | null {
  const name = capitalized(d.name);
  if (d.before === null || d.after === null) return null;
  if (d.kind === "level") {
    if (d.wentNegative) {
      return { text: `Short on ${d.name}: it was already out.`, tone: "short" };
    }
    if (d.after === "out") return { text: `${name} is out.`, tone: "plain" };
    return { text: `${name} went to ${d.after}.`, tone: "plain" };
  }
  if (d.note === "unit mismatch") {
    return {
      text: `${name} left alone: the pantry counts it in ${pluralUnit("2", d.unit)}.`,
      tone: "quiet",
    };
  }
  if (d.note === "no decimal" || d.used === null) {
    return { text: `${name} left alone: the recipe gives no amount.`, tone: "quiet" };
  }
  if (d.wentNegative) {
    return {
      text: `Short on ${d.name}: had ${amount(d.before, d.unit)}, used ${amount(d.used, d.unit)}.`,
      tone: "short",
    };
  }
  return { text: `${name} went to ${amount(d.after, d.unit)}.`, tone: "plain" };
}

const toneOrder: Record<SummaryLine["tone"], number> = { short: 0, plain: 1, quiet: 2 };

/**
 * One sentence per ingredient the cook touched, shortfalls first and quiet notes last; what
 * the pantry does not hold is one quiet line at the end, the names as the household wrote
 * them.
 */
export function summaryLines(deductions: readonly DeductionView[]): SummaryLine[] {
  const lines: SummaryLine[] = [];
  const missing: string[] = [];
  for (const d of deductions) {
    const line = lineOf(d);
    if (line === null) missing.push(d.name);
    else lines.push(line);
  }
  lines.sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone]);
  if (missing.length > 0) {
    lines.push({ text: `Not in the pantry: ${missing.join(", ")}.`, tone: "quiet" });
  }
  return lines;
}
