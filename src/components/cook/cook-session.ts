/**
 * The Made it sheet's cook, one session per opening. A cook in flight holds the lock: no
 * second cook starts, and opening again keeps the session so the first cook's answer lands
 * where it was asked. An answer for any other session is dropped, never shown in a later
 * opening.
 */
export type CookState<R> = {
  session: number;
  /** The session whose cook is in flight, or null. */
  pending: number | null;
  result: R | null;
  error: string | null;
};

export type CookEvent<R> =
  | { type: "open" }
  | { type: "submit" }
  | { type: "done"; session: number; result: R }
  | { type: "failed"; session: number; error: string };

export function openedSession<R>(open: boolean): CookState<R> {
  return { session: open ? 1 : 0, pending: null, result: null, error: null };
}

export function canSubmit(state: CookState<unknown>): boolean {
  return state.pending === null;
}

export function cookSession<R>(state: CookState<R>, event: CookEvent<R>): CookState<R> {
  switch (event.type) {
    case "open":
      if (state.pending !== null) return state;
      return { session: state.session + 1, pending: null, result: null, error: null };
    case "submit":
      if (state.pending !== null) return state;
      return { ...state, pending: state.session, error: null };
    case "done":
    case "failed": {
      const pending = state.pending === event.session ? null : state.pending;
      if (event.session !== state.session) return { ...state, pending };
      return event.type === "done"
        ? { ...state, pending, result: event.result, error: null }
        : { ...state, pending, error: event.error };
    }
  }
}
