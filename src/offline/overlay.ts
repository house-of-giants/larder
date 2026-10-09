import type { CurrentList } from "#/components/list/types";
import type { QueuedOp } from "./queue";

/**
 * The list as the person left it: queued statuses laid over the server's (or the saved)
 * copy. A check carries the tap's time; any other status clears it.
 */
export function applyOps(list: CurrentList, ops: readonly QueuedOp[]): CurrentList {
  if (ops.length === 0) return list;
  const byItem = new Map(ops.map((op) => [op.listItemId, op]));
  return {
    ...list,
    sections: list.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        const op = byItem.get(item._id);
        if (!op) return item;
        return {
          ...item,
          status: op.status,
          checkedAt: op.status === "checked" ? op.at : undefined,
        };
      }),
    })),
  };
}
