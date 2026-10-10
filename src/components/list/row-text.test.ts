import { describe, expect, it } from "vitest";
import { recipeNamesLine } from "./row-text";

describe("recipeNamesLine", () => {
  it("says which recipe a plan item is for", () => {
    expect(recipeNamesLine(["Pot roast"], "plan")).toBe("for Pot roast");
  });

  it("joins two or more recipes with a comma, in the order given", () => {
    expect(recipeNamesLine(["Yogurt parfaits", "Sheet pan sausage"], "plan")).toBe(
      "for Yogurt parfaits, Sheet pan sausage",
    );
  });

  it("calls an item someone typed in the store added, whatever it holds", () => {
    expect(recipeNamesLine([], "adhoc")).toBe("added");
  });

  it("says nothing for a plan item whose recipes are all gone", () => {
    expect(recipeNamesLine([], "plan")).toBe("");
  });
});
