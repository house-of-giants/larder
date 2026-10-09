import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import type { CurrentList, ListItem } from "#/components/list/types";
import { applyOps } from "./overlay";

const id = (n: number) => `${n}listItems` as Id<"listItems">;

function item(n: number, name: string, status: ListItem["status"] = "needed"): ListItem {
  return {
    _id: id(n),
    source: "plan",
    displayName: name,
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
    { category: "produce", items: [item(1, "Onions"), item(2, "Basil", "checked")] },
    { category: "dairy_refrigerated", items: [item(3, "Eggs"), item(4, "Butter", "onHand")] },
  ],
};

function statuses(l: CurrentList) {
  return l.sections.flatMap((s) => s.items.map((i) => `${i.displayName}:${i.status}`));
}

describe("applyOps", () => {
  it("returns the list unchanged when nothing is queued", () => {
    expect(applyOps(list, [])).toBe(list);
  });

  it("applies queued statuses on top of the list, leaving other items alone", () => {
    const result = applyOps(list, [
      { listItemId: id(1), status: "checked", at: 50 },
      { listItemId: id(2), status: "needed", at: 51 },
      { listItemId: id(4), status: "needed", at: 52 },
    ]);
    expect(statuses(result)).toEqual([
      "Onions:checked",
      "Basil:needed",
      "Eggs:needed",
      "Butter:needed",
    ]);
  });

  it("stamps checkedAt with the op time on a check and clears it otherwise", () => {
    const withChecked: CurrentList = {
      ...list,
      sections: [
        { category: "produce", items: [{ ...item(2, "Basil", "checked"), checkedAt: 9 }] },
      ],
    };
    const checked = applyOps(list, [{ listItemId: id(1), status: "checked", at: 50 }]);
    const unchecked = applyOps(withChecked, [{ listItemId: id(2), status: "needed", at: 51 }]);
    expect(checked.sections[0].items[0].checkedAt).toBe(50);
    expect(unchecked.sections[0].items[0].checkedAt).toBeUndefined();
  });

  it("ignores ops for items no longer on the list", () => {
    const result = applyOps(list, [{ listItemId: id(99), status: "checked", at: 1 }]);
    expect(statuses(result)).toEqual(statuses(list));
  });

  it("does not change the list it was given", () => {
    applyOps(list, [{ listItemId: id(1), status: "checked", at: 1 }]);
    expect(list.sections[0].items[0].status).toBe("needed");
  });
});
