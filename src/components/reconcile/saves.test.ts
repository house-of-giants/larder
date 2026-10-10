import { describe, expect, it } from "vitest";
import { afterSave, leaveStep } from "./saves";

describe("afterSave", () => {
  it("clears the draft when the field still holds what was sent", () => {
    expect(afterSave("7", "7", false)).toEqual({ draft: null, send: null });
  });

  it("keeps a newer draft typed while the save was in flight", () => {
    expect(afterSave("7", "9", false)).toEqual({ draft: "9", send: null });
  });

  it("sends the newer draft next when a commit was asked for meanwhile", () => {
    expect(afterSave("7", "9", true)).toEqual({ draft: "9", send: "9" });
  });

  it("treats surrounding spaces as the same value", () => {
    expect(afterSave("7", " 7 ", true)).toEqual({ draft: null, send: null });
  });

  it("sends a newer draft back to the count it replaced (saved 5, sent 6, typed 5)", () => {
    // Compared with what was just persisted (6), not the 5 the field started from, so 5 is
    // sent and ends up persisted.
    expect(afterSave("6", "5", true)).toEqual({ draft: "5", send: "5" });
  });

  it("does not send a value that cannot be saved; the field keeps it to be fixed", () => {
    expect(afterSave("6", "abc", true)).toEqual({ draft: "abc", send: null });
  });
});

describe("leaveStep", () => {
  it("stays put when a save failed", () => {
    expect(leaveStep({ outcomes: [true, false], failing: false, edited: true })).toBe("stay");
  });

  it("stays put while a field holds a value that cannot be saved", () => {
    expect(leaveStep({ outcomes: [], failing: true, edited: false })).toBe("stay");
  });

  it("makes the list again when a save just landed, even before edited is set", () => {
    expect(leaveStep({ outcomes: [true], failing: false, edited: false })).toBe("regenerate");
  });

  it("makes the list again after an earlier edit", () => {
    expect(leaveStep({ outcomes: [], failing: false, edited: true })).toBe("regenerate");
  });

  it("just opens the list when nothing changed", () => {
    expect(leaveStep({ outcomes: [], failing: false, edited: false })).toBe("leave");
  });
});
