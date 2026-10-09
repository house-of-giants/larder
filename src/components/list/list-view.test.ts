import { describe, expect, it } from "vitest";
import type { Id } from "../../../convex/_generated/dataModel";
import { nextStatus, viewList } from "./list-view";
import type { CurrentList, ListItem } from "./types";

let n = 0;
function item(displayName: string, status: ListItem["status"] = "needed"): ListItem {
  n += 1;
  return {
    _id: `${n}listItems` as Id<"listItems">,
    source: "plan",
    displayName,
    required: { quantityText: "1", unit: "each" },
    status,
    sourceRecipeIds: [],
  };
}

const list: CurrentList = {
  listId: "1lists" as Id<"lists">,
  weekId: "1weeks" as Id<"weeks">,
  status: "active",
  sections: [
    {
      category: "produce",
      items: [
        item("Onions"),
        item("Basil", "checked"),
        item("Garlic", "onHand"),
        item("Lemons"),
        item("Parsley", "skipped"),
      ],
    },
    { category: "meat_deli", items: [] },
    {
      category: "dairy_refrigerated",
      items: [item("Eggs", "checked"), item("Butter", "onHand"), item("Milk")],
    },
  ],
};

const names = (items: ListItem[]) => items.map((i) => i.displayName);

describe("viewList", () => {
  it("splits each section into what is left and what is in the cart, in query order", () => {
    const view = viewList(list, null);
    expect(
      view.sections.map((s) => ({
        category: s.category,
        needed: names(s.needed),
        inCart: names(s.inCart),
      })),
    ).toEqual([
      { category: "produce", needed: ["Onions", "Lemons"], inCart: ["Basil"] },
      { category: "dairy_refrigerated", needed: ["Milk"], inCart: ["Eggs"] },
    ]);
  });

  it("gathers already-have and skipped items at the end, in section order", () => {
    const view = viewList(list, null);
    expect(names(view.alreadyHave)).toEqual(["Garlic", "Butter"]);
    expect(names(view.skipped)).toEqual(["Parsley"]);
  });

  it("counts what is left to get across the whole list", () => {
    expect(viewList(list, null).toGet).toBe(3);
  });

  it("offers a filter for each section that has items, and none for empty ones", () => {
    expect(viewList(list, null).categories).toEqual(["produce", "dairy_refrigerated"]);
  });

  it("narrows to one section without changing the count or the filters", () => {
    const view = viewList(list, "dairy_refrigerated");
    expect(view.sections.map((s) => s.category)).toEqual(["dairy_refrigerated"]);
    expect(names(view.alreadyHave)).toEqual(["Butter"]);
    expect(view.skipped).toEqual([]);
    expect(view.toGet).toBe(3);
    expect(view.categories).toEqual(["produce", "dairy_refrigerated"]);
  });

  it("shows the whole list when the filter names a section that is gone", () => {
    expect(viewList(list, "bakery").sections.map((s) => s.category)).toEqual([
      "produce",
      "dairy_refrigerated",
    ]);
  });

  it("counts nothing left when every item is checked, skipped, or already here", () => {
    const done: CurrentList = {
      ...list,
      sections: [
        { category: "produce", items: [item("Onions", "checked"), item("Garlic", "onHand")] },
      ],
    };
    expect(viewList(done, null).toGet).toBe(0);
  });
});

describe("nextStatus", () => {
  it("checks a needed item", () => {
    expect(nextStatus("needed")).toBe("checked");
  });

  it("puts anything else back on the list", () => {
    expect(nextStatus("checked")).toBe("needed");
    expect(nextStatus("skipped")).toBe("needed");
    expect(nextStatus("onHand")).toBe("needed");
  });
});
