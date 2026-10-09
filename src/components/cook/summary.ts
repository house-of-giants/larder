import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { amountText } from "#/components/recipes/recipe-text";
import { formatQuantity } from "#/lib/quantities";

export type DeductionView = FunctionReturnType<typeof api.cooking.madeIt>["deductions"][number];
export type SummaryLine = { text: string; tone: "short" | "plain" | "quiet" };

const capitalized = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
const amount = (decimal: number, unit: string) => amountText(formatQuantity(decimal), unit);

function lineOf(d: DeductionView): SummaryLine {
  const name = capitalized(d.name);
  if (d.kind === "level") {
    if (d.before === null || d.after === null) {
      return { text: `${name} is not in the pantry.`, tone: "quiet" };
    }
    if (d.wentNegative) {
      return { text: `Short on ${d.name}: it was already out.`, tone: "short" };
    }
    return { text: `${name} went to ${d.after}`, tone: "plain" };
  }
  if (d.before === null || d.after === null) {
    return { text: `${name} is not in the pantry.`, tone: "quiet" };
  }
  if (d.note === "unit mismatch") {
    return { text: `${name} left alone: the pantry counts it in ${d.unit}.`, tone: "quiet" };
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
  return { text: `${name} went to ${amount(d.after, d.unit)}`, tone: "plain" };
}

const toneOrder: Record<SummaryLine["tone"], number> = { short: 0, plain: 1, quiet: 2 };

/** One line per ingredient the cook touched: shortfalls first, quiet notes last. */
export function summaryLines(deductions: readonly DeductionView[]): SummaryLine[] {
  return deductions.map(lineOf).sort((a, b) => toneOrder[a.tone] - toneOrder[b.tone]);
}
