import { describe, expect, it } from "vitest";
import { localIsoDate, weekOfLabel } from "#/lib/week-dates";

describe("localIsoDate", () => {
  it("writes the local calendar day, zero-padded", () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("stays on the local day late in the evening, where UTC has already moved on", () => {
    // 11:30 pm local on Oct 9 is Oct 10 in UTC for any zone west of Greenwich.
    expect(localIsoDate(new Date(2026, 9, 9, 23, 30))).toBe("2026-10-09");
  });
});

describe("weekOfLabel", () => {
  it("reads a YYYY-MM-DD week as a short month and day", () => {
    expect(weekOfLabel("2026-10-09")).toBe("Week of Oct 9");
  });

  it("shows anything else as written", () => {
    expect(weekOfLabel("next week")).toBe("Week of next week");
  });
});
