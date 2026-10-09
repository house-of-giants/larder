/**
 * The multiplier text to send, or null when sending it would change nothing. Compared
 * against the save still in flight, if any, not only the saved value: a quick pick tapped
 * while a typed draft is saving must still go out, or the draft would win.
 */
export function multiplierChange(
  next: string,
  { inFlight, saved }: { inFlight: string | null; saved: string },
): string | null {
  const text = next.trim();
  return text === (inFlight ?? saved) ? null : text;
}

export type PickEvent = "pointerdown" | "pointerup" | "pointercancel" | "blur" | "click";

/**
 * Whether a quick pick is being pressed. Pressing one blurs the typed field first, and that
 * blur must drop the draft instead of saving it; any other event on the pick (released,
 * canceled, focus gone, clicked) ends the press, so a later typed draft saves normally.
 */
export function pickState(_picking: boolean, event: PickEvent): boolean {
  return event === "pointerdown";
}
