/**
 * A member's line under Who lives here: the name the sign-in carried, or "Someone" when the
 * token had none, with "(you)" after the signed-in member.
 */
export function memberLabel(name: string | undefined, isYou: boolean): string {
  const shown = name?.trim() || "Someone";
  return isYou ? `${shown} (you)` : shown;
}
