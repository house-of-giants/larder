// How reconcile's autosaving fields and "Looks right" take turns.

/**
 * After a count save lands: if the field still holds what was sent, the draft is done;
 * a newer value typed while the save was in flight stays, and is sent next when someone
 * already asked to commit (left the field, pressed Enter, or tapped Looks right).
 */
export function afterSave(
  sent: string,
  draft: string | null,
  requested: boolean,
): { draft: string | null; commitAgain: boolean } {
  if (draft === null || draft.trim() === sent.trim()) return { draft: null, commitAgain: false };
  return { draft, commitAgain: requested };
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
