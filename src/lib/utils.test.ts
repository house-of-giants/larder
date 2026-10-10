import { describe, expect, it } from "vitest";
import { cn } from "#/lib/utils";

// The type roles in src/styles.css (--text-*) are font sizes, not colors. tailwind-merge
// must know that, or a role and a text color in one class list erase each other.
describe("cn with the type roles", () => {
  it("keeps a type role beside a text color", () => {
    expect(cn("text-subhead text-primary-foreground")).toBe("text-subhead text-primary-foreground");
    expect(cn("text-caption", "text-muted-foreground")).toBe("text-caption text-muted-foreground");
  });

  it("lets a later type role replace an earlier size", () => {
    expect(cn("text-sm text-foreground", "text-body")).toBe("text-foreground text-body");
    expect(cn("text-subhead", "text-display")).toBe("text-display");
  });
});
