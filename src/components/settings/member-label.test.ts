import { describe, expect, it } from "vitest";
import { memberLabel } from "./member-label";

describe("memberLabel: a member's line in Who lives here", () => {
  it("uses the name from the sign-in when there is one", () => {
    expect(memberLabel("Dominic", false)).toBe("Dominic");
  });

  it("marks the signed-in member", () => {
    expect(memberLabel("Dominic", true)).toBe("Dominic (you)");
  });

  it("says Someone when the token carried no name", () => {
    expect(memberLabel(undefined, true)).toBe("Someone (you)");
    expect(memberLabel(undefined, false)).toBe("Someone");
  });

  it("treats a blank name as no name", () => {
    expect(memberLabel("   ", false)).toBe("Someone");
  });
});
