import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NeededText } from "./needed";

/** What the row renders: the markup, and the text a reader (and the e2e) sees. */
function render(required: { quantityText: string; unit: string }[]) {
  const html = renderToStaticMarkup(<NeededText required={required} />);
  return { html, text: html.replace(/<[^>]+>/g, "") };
}

describe("NeededText", () => {
  it("reads the butter row exactly as the store walk expects", () => {
    expect(render([{ quantityText: "22", unit: "tbsp" }]).text).toBe("The week needs 22 tbsp");
  });

  it("joins split units with 'and', each amount in tomato", () => {
    const { html, text } = render([
      { quantityText: "1", unit: "tbsp" },
      { quantityText: "2", unit: "tsp" },
    ]);
    expect(text).toBe("The week needs 1 tbsp and 2 tsp");
    expect(html.match(/data-tone="accent"/g)).toHaveLength(2);
  });

  it("leaves 'each' off a plain count and pluralises a counted unit", () => {
    expect(render([{ quantityText: "3", unit: "each" }]).text).toBe("The week needs 3");
    expect(render([{ quantityText: "1 1/2", unit: "cup" }]).text).toBe("The week needs 1 1/2 cups");
  });

  it("keeps words with no number quiet", () => {
    const { html, text } = render([{ quantityText: "as needed", unit: "" }]);
    expect(text).toBe("The week needs as needed");
    expect(html).toContain('data-tone="quiet"');
  });
});
