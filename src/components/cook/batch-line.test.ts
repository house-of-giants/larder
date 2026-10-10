import { describe, expect, it } from "vitest";
import { batchLine } from "./batch-line";

const biscuits = { quantityText: "8", quantityDecimal: 8, unit: "biscuit" };
const sentence = (line: ReturnType<typeof batchLine>) => line && `${line.lead} ${line.made}.`;

describe("batchLine", () => {
  it("says what one batch makes, in the cook's words", () => {
    expect(batchLine("1", biscuits)).toEqual({ lead: "1 batch makes", made: "8 biscuits" });
    expect(sentence(batchLine("1", biscuits))).toBe("1 batch makes 8 biscuits.");
  });

  it("writes half a batch as the recipe would (1/2) and halves the yield", () => {
    expect(sentence(batchLine("1/2", biscuits))).toBe("1/2 batch makes 4 biscuits.");
  });

  it("takes the plural for more than one batch", () => {
    expect(sentence(batchLine("2", biscuits))).toBe("2 batches make 16 biscuits.");
    expect(
      sentence(batchLine(" 1 1/2 ", { quantityText: "6", quantityDecimal: 6, unit: "portion" })),
    ).toBe("1 1/2 batches make 9 portions.");
  });

  it("keeps the recipe's words at one batch, and a count with no unit bare", () => {
    expect(sentence(batchLine("1", { quantityText: "a dozen", unit: "biscuit" }))).toBe(
      "1 batch makes a dozen biscuit.",
    );
    expect(
      sentence(batchLine("2", { quantityText: "12", quantityDecimal: 12, unit: "each" })),
    ).toBe("2 batches make 24.");
  });

  it("says nothing without a yield, a number to scale, or a usable batch count", () => {
    expect(batchLine("1", undefined)).toBeNull();
    expect(batchLine("2", { quantityText: "a dozen", unit: "biscuit" })).toBeNull();
    expect(batchLine("", biscuits)).toBeNull();
    expect(batchLine("lots", biscuits)).toBeNull();
    expect(batchLine("0", biscuits)).toBeNull();
  });
});
