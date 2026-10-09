import type { Id } from "../../convex/_generated/dataModel";
import type { TapStatus } from "#/components/list/types";
import { drain, enqueue, mergeQueues, settle, type QueuedOp } from "./queue";

type Deps = {
  /** The queue saved on this phone (already filtered to the verified user). */
  read: () => Promise<QueuedOp[]>;
  write: (queue: QueuedOp[]) => void | Promise<void>;
  /** Sends one op; rejects when it should be retried later. */
  send: (op: QueuedOp) => Promise<void>;
};

/**
 * The check-off queue without React. Nothing is sent or written until the stored queue
 * has been read: taps made before then are buffered and merged over it (latest tap per
 * item wins), so an older stored op can never overwrite a newer tap. After that, a tap
 * goes straight to the server when there is a signal and nothing older is waiting;
 * otherwise it is queued and sent, in order, when sending is possible again.
 */
export function createListOps(deps: Deps) {
  let send = deps.send;
  let queue: QueuedOp[] = [];
  let loaded = false;
  let canSend = false;
  let draining = false;
  // The latest tap per item, so a slow failure never queues over a newer tap.
  const latest = new Map<Id<"listItems">, QueuedOp>();
  const listeners = new Set<() => void>();

  function commit(next: QueuedOp[]) {
    queue = next;
    if (loaded) void deps.write(next);
    for (const listener of listeners) listener();
  }

  async function flush() {
    if (!loaded || !canSend || draining) return;
    draining = true;
    try {
      // Taps made during a drain are queued; keep going while each pass makes progress.
      while (queue.length > 0 && canSend) {
        const attempted = queue;
        const failed = await drain(attempted, send);
        commit(settle(queue, attempted, failed));
        if (failed.length === attempted.length) break;
      }
    } finally {
      draining = false;
    }
  }

  return {
    getQueue: () => queue,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Swaps the sender, e.g. when the Convex mutation function changes identity. */
    setSend(next: (op: QueuedOp) => Promise<void>) {
      send = next;
    },
    setCanSend(value: boolean) {
      canSend = value;
      void flush();
    },
    async load() {
      const stored = await deps.read();
      loaded = true;
      commit(mergeQueues(stored, queue));
      await flush();
    },
    async tap(listItemId: Id<"listItems">, status: TapStatus, at: number) {
      const op: QueuedOp = { listItemId, status, at };
      latest.set(listItemId, op);
      if (!loaded || !canSend || queue.length > 0 || draining) {
        commit(enqueue(queue, op));
        void flush();
        return;
      }
      try {
        await send(op);
      } catch {
        if (latest.get(listItemId) === op) commit(enqueue(queue, op));
      }
    },
  };
}

export type ListOps = ReturnType<typeof createListOps>;
