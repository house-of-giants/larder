import { describe, expect, it } from "vitest";
import { multiplierChange } from "./multiplier";

describe("multiplierChange", () => {
  it("sends a quick pick that matches the saved value when a typed draft is in flight", () => {
    // Saved "1"; "3" was typed and is saving on blur; then "1" is tapped.
    expect(multiplierChange("1", { inFlight: "3", saved: "1" })).toBe("1");
  });

  it("skips a value that is already saved and nothing else is in flight", () => {
    expect(multiplierChange(" 1 ", { inFlight: null, saved: "1" })).toBeNull();
  });

  it("skips a value that is already on its way", () => {
    expect(multiplierChange("2", { inFlight: "2", saved: "1" })).toBeNull();
  });

  it("sends a new value, trimmed", () => {
    expect(multiplierChange(" 1 1/2 ", { inFlight: null, saved: "1" })).toBe("1 1/2");
  });
});
