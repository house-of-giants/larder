import type { CurrentList, ListItem, ListStatus, TapStatus } from "./types";

export type ListView = {
  /** Needed items across the whole list, whatever the filter. */
  toGet: number;
  /** Sections that have anything on them, for the filter chips. */
  categories: string[];
  /** What is left and what is in the cart, per shown section, in query order. */
  sections: { category: string; needed: ListItem[]; inCart: ListItem[] }[];
  alreadyHave: ListItem[];
  skipped: ListItem[];
};

/**
 * Store mode's reading of the list: per section, what is left to get with what is in
 * the cart below it; things already here or skipped gathered at the end. A filter for a
 * section that is gone shows everything.
 */
export function viewList(list: CurrentList, filter: string | null): ListView {
  const present = list.sections.filter((section) => section.items.length > 0);
  const categories = present.map((section) => section.category);
  const shown =
    filter !== null && categories.includes(filter)
      ? present.filter((section) => section.category === filter)
      : present;
  const all = present.flatMap((section) => section.items);
  const items = shown.flatMap((section) => section.items);
  const withStatus = (status: ListStatus) => (item: ListItem) => item.status === status;

  return {
    toGet: all.filter(withStatus("needed")).length,
    categories,
    sections: shown
      .map((section) => ({
        category: section.category,
        needed: section.items.filter(withStatus("needed")),
        inCart: section.items.filter(withStatus("checked")),
      }))
      .filter((section) => section.needed.length + section.inCart.length > 0),
    alreadyHave: items.filter(withStatus("onHand")),
    skipped: items.filter(withStatus("skipped")),
  };
}

/** A tap checks a needed item and puts anything else back on the list. */
export function nextStatus(status: ListStatus): TapStatus {
  return status === "needed" ? "checked" : "needed";
}
