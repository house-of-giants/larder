// An amount of something made, in the words a fridge note would use: "12 sliders",
// "1 slider", "8 oz". The recipe's own text stays; only the unit takes a plural.

// Short units read the same for one or many.
const invariant = new Set([
  "oz",
  "lb",
  "lbs",
  "g",
  "kg",
  "ml",
  "l",
  "tbsp",
  "tsp",
  "qt",
  "pt",
  "gal",
]);

function plural(unit: string): string {
  const word = unit.toLowerCase();
  if (invariant.has(word) || word.endsWith("s")) return unit;
  if (/(ch|sh|x|z)$/.test(word)) return `${unit}es`;
  if (/[^aeiou]y$/.test(word)) return `${unit.slice(0, -1)}ies`;
  return `${unit}s`;
}

/** "12 sliders" from ("12", 12, "slider"). `each` is a plain count, so it stays off. */
export function amountWords(text: string, decimal: number, unit: string): string {
  const trimmed = unit.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "each") return text;
  const shown = decimal > 0 && decimal <= 1 ? trimmed : plural(trimmed);
  return `${text} ${shown}`;
}
