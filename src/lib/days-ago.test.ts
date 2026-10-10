import { describe, expect, it } from "vitest";
import { madeAgo, madeAgoLine } from "#/lib/days-ago";

// Local times, so the calendar day is the kitchen's own.
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();

describe("madeAgo", () => {
  it("says today for earlier the same calendar day", () => {
    expect(madeAgo(at(9, 8), at(9, 20))).toBe("Made today");
  });

  it("says yesterday across midnight, even under 24 hours", () => {
    expect(madeAgo(at(8, 23), at(9, 7))).toBe("Made yesterday");
  });

  it("counts calendar days after that", () => {
    expect(madeAgo(at(4, 12), at(9, 9))).toBe("Made 5 days ago");
  });

  it("says today for a clock a little behind", () => {
    expect(madeAgo(at(9, 21), at(9, 20))).toBe("Made today");
  });
});

describe("madeAgoLine: a leftover's caption", () => {
  it("says when and where in one quiet line", () => {
    expect(madeAgoLine(at(7, 18), at(9, 12), "fridge")).toBe("made 2 days ago · fridge");
  });

  it("says yesterday and the freezer", () => {
    expect(madeAgoLine(at(8, 23), at(9, 7), "freezer")).toBe("made yesterday · freezer");
  });

  it("says today", () => {
    expect(madeAgoLine(at(9, 8), at(9, 20), "fridge")).toBe("made today · fridge");
  });
});
