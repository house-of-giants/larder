import { describe, expect, it } from "vitest";
import { summaryLines, type DeductionView } from "./summary";

const count = (over: Partial<Extract<DeductionView, { kind: "count" }>>): DeductionView => ({
  ingredientId: "i" as DeductionView["ingredientId"],
  name: "Hawaiian rolls",
  kind: "count",
  unit: "each",
  before: 12,
  after: 0,
  used: 12,
  wentNegative: false,
  ...over,
});

describe("summaryLines", () => {
  it("says where a count and a level ended up, in the household's words", () => {
    expect(
      summaryLines([
        count({}),
        count({ name: "sliced ham", unit: "oz", before: 8, after: 0, used: 8 }),
        count({ name: "unsalted butter", unit: "tbsp", before: 5, after: 3, used: 2 }),
        {
          ingredientId: "s" as DeductionView["ingredientId"],
          name: "Italian seasoning",
          kind: "level",
          before: "full",
          after: "half",
          wentNegative: false,
        },
      ]),
    ).toEqual([
      { text: "Hawaiian rolls went to 0", tone: "plain" },
      { text: "Sliced ham went to 0 oz", tone: "plain" },
      { text: "Unsalted butter went to 3 tbsp", tone: "plain" },
      { text: "Italian seasoning went to half", tone: "plain" },
    ]);
  });

  it("puts shortfalls first, with what was had and what was used", () => {
    const lines = summaryLines([
      count({}),
      count({ name: "sliced ham", unit: "oz", before: 6, after: 0, used: 8, wentNegative: true }),
    ]);
    expect(lines[0]).toEqual({ text: "Short on sliced ham: had 6 oz, used 8 oz.", tone: "short" });
  });

  it("names a level that was already out as short", () => {
    expect(
      summaryLines([
        {
          ingredientId: "d" as DeductionView["ingredientId"],
          name: "Dijon mustard",
          kind: "level",
          before: "out",
          after: "out",
          wentNegative: true,
        },
      ]),
    ).toEqual([{ text: "Short on Dijon mustard: it was already out.", tone: "short" }]);
  });

  it("says quietly why a count was left alone", () => {
    expect(
      summaryLines([
        count({
          name: "bacon",
          unit: "slice",
          before: 10,
          after: 10,
          used: null,
          note: "unit mismatch",
        }),
        count({ name: "large eggs", before: 15, after: 15, used: null, note: "no decimal" }),
        count({ name: "lettuce", unit: "cup", before: null, after: null, used: 3 }),
      ]),
    ).toEqual([
      { text: "Bacon left alone: the pantry counts it in slice.", tone: "quiet" },
      { text: "Large eggs left alone: the recipe gives no amount.", tone: "quiet" },
      { text: "Lettuce is not in the pantry.", tone: "quiet" },
    ]);
  });
});
