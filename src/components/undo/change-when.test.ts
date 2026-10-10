import { describe, expect, it } from "vitest";
import { changeWhen } from "./change-when";

// Local times, so the day printed is the kitchen's own.
const at = (month: number, day: number, hour: number, minute: number) =>
  new Date(2026, month - 1, day, hour, minute).getTime();

describe("changeWhen: an undo row's timestamp carries the day", () => {
  it("reads weekday, date, and time", () => {
    expect(changeWhen(at(10, 9, 23, 9), "en-US")).toBe("Fri Oct 9, 11:09 PM");
  });

  it("keeps the minutes two digits in the morning", () => {
    expect(changeWhen(at(10, 5, 7, 3), "en-US")).toBe("Mon Oct 5, 7:03 AM");
  });

  it("tells two Fridays apart", () => {
    expect(changeWhen(at(10, 2, 9, 0), "en-US")).not.toBe(changeWhen(at(10, 9, 9, 0), "en-US"));
  });
});
