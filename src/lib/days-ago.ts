// How long ago something was made, by the kitchen's calendar: last night's dinner is
// "yesterday" this morning, even though fewer than 24 hours have passed.

const dayMs = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function madeAgo(madeAt: number, now: number): string {
  // Rounded, so a daylight-saving day of 23 or 25 hours still counts as one.
  const days = Math.round((startOfDay(now) - startOfDay(madeAt)) / dayMs);
  if (days <= 0) return "Made today";
  if (days === 1) return "Made yesterday";
  return `Made ${days} days ago`;
}
