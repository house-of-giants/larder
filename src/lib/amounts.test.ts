import { describe, expect, it } from "vitest";
import { amountWords } from "#/lib/amounts";

describe("amountWords", () => {
  it("names more than one of a thing in the plural", () => {
    expect(amountWords("12", 12, "slider")).toBe("12 sliders");
    expect(amountWords("6", 6, "portion")).toBe("6 portions");
    expect(amountWords("2", 2, "sandwich")).toBe("2 sandwiches");
    expect(amountWords("3", 3, "patty")).toBe("3 patties");
  });

  it("keeps one, or part of one, singular", () => {
    expect(amountWords("1", 1, "slider")).toBe("1 slider");
    expect(amountWords("1/2", 0.5, "slider")).toBe("1/2 slider");
  });

  it("leaves short units and words already plural alone", () => {
    expect(amountWords("8", 8, "oz")).toBe("8 oz");
    expect(amountWords("2", 2, "tbsp")).toBe("2 tbsp");
    expect(amountWords("4", 4, "servings")).toBe("4 servings");
  });

  it("drops each, the app's word for a plain count", () => {
    expect(amountWords("12", 12, "each")).toBe("12");
  });

  it("names zero in the plural", () => {
    expect(amountWords("0", 0, "slider")).toBe("0 sliders");
  });
});
