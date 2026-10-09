// Bulk goods, spices, and condiments are levels, not measurements. No decimals here.

export const LEVELS = ["full", "half", "low", "out"] as const;

export type Level = (typeof LEVELS)[number];

/** One step emptier; out stays out. */
export function stepDown(level: Level): Level {
  return LEVELS[Math.min(LEVELS.indexOf(level) + 1, LEVELS.length - 1)];
}

/** Worth putting on the list. */
export function isLowOrOut(level: Level): boolean {
  return level === "low" || level === "out";
}
