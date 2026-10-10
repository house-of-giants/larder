import { parseQuantity } from "#/lib/quantities";

// How reconcile's autosaving fields and "Looks right" take turns.

/**
 * After a count save lands: if the field still holds what was sent, the draft is done. A
 * newer value typed while the save was in flight stays, and when someone already asked to
 * commit (left the field, pressed Enter, tapped Looks right) it is the next value to send:
 * compared with what was just persisted (`sent`), never the count the field started from,
 * so going 5 -> 6 -> 5 ends at 5. A newer value that is not a number is kept, not sent.
 */
export function afterSave(
  sent: string,
  draft: string | null,
  requested: boolean,
): { draft: string | null; send: string | null } {
  if (draft === null || draft.trim() === sent.trim()) return { draft: null, send: null };
  const send = requested && parseQuantity(draft) !== null ? draft : null;
  return { draft, send };
}

export type LeaveStep = "stay" | "regenerate" | "leave";

/**
 * What "Looks right" does once every pending save has settled: stay when one failed or a
 * field holds something that cannot be saved; make the list again when anything was saved;
 * otherwise just open it.
 */
export function leaveStep({
  outcomes,
  failing,
  edited,
}: {
  outcomes: readonly boolean[];
  failing: boolean;
  edited: boolean;
}): LeaveStep {
  if (failing || outcomes.includes(false)) return "stay";
  return edited || outcomes.length > 0 ? "regenerate" : "leave";
}

/** How a reconcile row hands its saves to the screen. */
export type SaveTracker = {
  /** A save in flight; it resolves true when it landed, false when it failed. */
  track: (save: Promise<boolean>) => void;
  /** Whether this row is holding an error (a failed save or a value that cannot save). */
  failing: (key: string, failing: boolean) => void;
};
