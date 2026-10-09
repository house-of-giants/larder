// Weeks are keyed by a plain calendar day ("2026-10-09"), in the household's local time.

const pad = (n: number) => String(n).padStart(2, "0");

/** The local calendar day as YYYY-MM-DD; toISOString would give the UTC day instead. */
export function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "Week of Oct 9". Built from the parts so the day never shifts across time zones. */
export function weekOfLabel(weekOf: string): string {
  const match = isoDate.exec(weekOf);
  if (match === null) return `Week of ${weekOf}`;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Week of ${label}`;
}
