import { parseQuantity } from "./quantities";

/** Units the cook writes the same at any amount: abbreviations, "each", and a pinch. */
const INVARIANT = new Set([
  "lb",
  "oz",
  "g",
  "kg",
  "ml",
  "l",
  "tbsp",
  "tsp",
  "each",
  "pinch",
  "dash",
]);

function plural(word: string): string {
  if (/(ch|sh|x|z)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/**
 * DESIGN.md's Plural Rule, for display only: "2 sprigs", "4 cups", "1 1/2 cups". One, or a
 * fraction under one ("1/2 cup", as recipes write it), stays singular; weights, spoons and
 * units already ending in s stay as written; words with no number leave the unit alone.
 * In a phrase ("large can") the last word carries the plural.
 */
export function pluralUnit(quantityText: string, unit: string): string {
  const value = parseQuantity(quantityText);
  if (value === null || value <= 1) return unit;
  const match = /^(.*?)([A-Za-z]+)$/.exec(unit);
  if (!match) return unit;
  const [, lead, last] = match;
  const lower = last.toLowerCase();
  if (INVARIANT.has(lower) || lower.endsWith("s")) return unit;
  return lead + plural(last);
}
