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
