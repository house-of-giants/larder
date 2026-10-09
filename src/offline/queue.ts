import type { Id } from "../../convex/_generated/dataModel";
import type { TapStatus } from "#/components/list/types";

/** A check-off waiting for a signal. Status writes are idempotent, so replay is safe. */
export type QueuedOp = { listItemId: Id<"listItems">; status: TapStatus; at: number };

/** Adds an op, keeping one per item: the latest tap wins. */
export function enqueue(queue: readonly QueuedOp[], op: QueuedOp): QueuedOp[] {
  return [...queue.filter((queued) => queued.listItemId !== op.listItemId), op];
}

/**
 * Sends each op in order, one at a time, and returns the ones that failed so the next
 * attempt can retry them. A failure does not stop the rest: items are independent.
 */
export async function drain(
  queue: readonly QueuedOp[],
  send: (op: QueuedOp) => Promise<unknown>,
): Promise<QueuedOp[]> {
  const failed: QueuedOp[] = [];
  for (const op of queue) {
    try {
      await send(op);
    } catch {
      failed.push(op);
    }
  }
  return failed;
}

/**
 * The queue after a drain of `attempted` finished with `failed` left over. Taps made
 * while the drain ran replaced their item's op, so only the exact ops that went through
 * are removed.
 */
export function settle(
  current: readonly QueuedOp[],
  attempted: readonly QueuedOp[],
  failed: readonly QueuedOp[],
): QueuedOp[] {
  const sent = new Set(attempted.filter((op) => !failed.includes(op)));
  return current.filter((op) => !sent.has(op));
}

/**
 * The stored queue with taps made before it was read laid on top: one op per item, the
 * later `at` winning, stored order first.
 */
export function mergeQueues(
  stored: readonly QueuedOp[],
  buffered: readonly QueuedOp[],
): QueuedOp[] {
  return buffered.reduce(
    (queue, op) => {
      const existing = queue.find((queued) => queued.listItemId === op.listItemId);
      return existing && existing.at > op.at ? queue : enqueue(queue, op);
    },
    [...stored],
  );
}
