import { describe, expect, it } from "vitest";
import { afterSave, leaveStep } from "./saves";

describe("afterSave", () => {
  it("clears the draft when the field still holds what was sent", () => {
    expect(afterSave("7", "7", false)).toEqual({ draft: null, commitAgain: false });
  });

  it("keeps a newer draft typed while the save was in flight", () => {
    expect(afterSave("7", "9", false)).toEqual({ draft: "9", commitAgain: false });
  });

  it("sends the newer draft next when a commit was asked for meanwhile", () => {
    expect(afterSave("7", "9", true)).toEqual({ draft: "9", commitAgain: true });
  });

  it("treats surrounding spaces as the same value", () => {
    expect(afterSave("7", " 7 ", true)).toEqual({ draft: null, commitAgain: false });
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
