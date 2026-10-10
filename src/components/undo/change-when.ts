/**
 * When a change happened, with its day, so two Fridays read apart: "Fri Oct 9, 11:09 PM".
 * In the phone's own locale unless one is given.
 */
export function changeWhen(at: number, locale?: string): string {
  const date = new Date(at);
  const weekday = date.toLocaleDateString(locale, { weekday: "short" });
  const day = date.toLocaleDateString(locale, { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  return `${weekday} ${day}, ${time}`;
}
