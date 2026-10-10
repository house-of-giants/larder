import { describe, expect, it } from "vitest";
import { type CookState, canSubmit, cookSession, openedSession } from "./cook-session";

const closed: CookState<string> = openedSession(false);

describe("cookSession", () => {
  it("starts a clean session on each opening while nothing is cooking", () => {
    let s = cookSession(closed, { type: "open" });
    s = cookSession(s, { type: "submit" });
    s = cookSession(s, { type: "done", session: s.session, result: "first" });
    expect(s.result).toBe("first");
    const reopened = cookSession(s, { type: "open" });
    expect(reopened).toEqual({ session: s.session + 1, pending: null, result: null, error: null });
  });

  it("refuses a second cook while one is in flight", () => {
    const s = cookSession(cookSession(closed, { type: "open" }), { type: "submit" });
    expect(canSubmit(s)).toBe(false);
    expect(cookSession(s, { type: "submit" })).toBe(s);
  });

  it("keeps the session and the lock when it is opened again mid-cook, so the cook's result lands", () => {
    // Submit, then (somehow) close and reopen before the server answers.
    let s = cookSession(closed, { type: "open" });
    s = cookSession(s, { type: "submit" });
    const cooking = s.session;
    s = cookSession(s, { type: "open" });
    expect(s.session).toBe(cooking);
    expect(canSubmit(s)).toBe(false);
    // The deferred first cook resolves now.
    s = cookSession(s, { type: "done", session: cooking, result: "first" });
    expect(s).toMatchObject({ session: cooking, pending: null, result: "first" });
    expect(canSubmit(s)).toBe(true);
  });

  it("never lets a stale result or error land in a later session", () => {
    let s = cookSession(closed, { type: "open" });
    const first = s.session;
    s = cookSession(cookSession(s, { type: "open" }), { type: "open" });
    expect(cookSession(s, { type: "done", session: first, result: "old" }).result).toBeNull();
    expect(cookSession(s, { type: "failed", session: first, error: "old" }).error).toBeNull();
  });

  it("frees the lock and keeps the error on a failed cook", () => {
    let s = cookSession(cookSession(closed, { type: "open" }), { type: "submit" });
    s = cookSession(s, { type: "failed", session: s.session, error: "Not signed in." });
    expect(s).toMatchObject({ pending: null, error: "Not signed in.", result: null });
    expect(canSubmit(s)).toBe(true);
  });
});
