import { describe, expect, it } from "vitest";
import { LEVELS, isLowOrOut, stepDown } from "#/lib/levels";

describe("LEVELS", () => {
  it("runs from full to out", () => {
    expect(LEVELS).toEqual(["full", "half", "low", "out"]);
  });
});

describe("stepDown", () => {
  it.each([
    ["full", "half"],
    ["half", "low"],
    ["low", "out"],
    ["out", "out"],
  ] as const)("takes %s to %s", (from, to) => {
    expect(stepDown(from)).toBe(to);
  });
});

describe("isLowOrOut", () => {
  it.each([
    ["full", false],
    ["half", false],
    ["low", true],
    ["out", true],
  ] as const)("%s -> %s", (level, expected) => {
    expect(isLowOrOut(level)).toBe(expected);
  });
});
