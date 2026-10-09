import type { Id } from "../../convex/_generated/dataModel";
import type { TapStatus } from "#/components/list/types";
import { canShowOffline } from "#/lib/offline-ownership";
import { drain, enqueue, mergeQueues, settle, type QueuedOp } from "./queue";

/** The saved queue, stamped with the Clerk user whose taps it holds. */
export type StoredQueue = { owner: string; ops: QueuedOp[] };

/** One shared slot on this phone (IndexedDB `queue:list` in the app). */
export type QueueStorage = {
  get: () => Promise<StoredQueue | undefined>;
  set: (value: StoredQueue) => Promise<void>;
  del: () => Promise<void>;
};

type Deps = {
  /** The verified user this store works for; null keeps taps in memory only. */
  owner: string | null;
  storage: QueueStorage;
  /** Sends one op; rejects when it should be retried later. */
  send: (op: QueuedOp) => Promise<void>;
};

/**
 * The check-off queue without React, for one verified user.
 *
 * - Nothing is sent or written until the stored queue has been read: taps made before
 *   then are buffered and merged over it (latest tap per item wins), so an older stored
 *   op can never overwrite a newer tap.
 * - After that, a tap goes straight to the server when there is a signal and nothing
 *   older is waiting; otherwise it is queued and sent, in order, when it can be.
 * - `dispose()` ends the session: a read, drain, or write still in flight finishes
 *   without persisting or sending anything. `load()` starts a new session (React may
 *   mount, clean up, and mount again).
 * - The phone has one queue slot. This store reads only its owner's queue, and writes or
 *   deletes the slot only while it is empty or still its owner's.
 */
export function createListOps(deps: Deps) {
  let send = deps.send;
  let queue: QueuedOp[] = [];
  let loaded = false;
  let disposed = false;
  let canSend = false;
  let draining = false;
  // Bumped by every load and dispose; async work from an older session stops.
  let session = 0;
  // The latest tap per item, so a slow failure never queues over a newer tap.
  const latest = new Map<Id<"listItems">, QueuedOp>();
  const listeners = new Set<() => void>();

  async function persist(next: QueuedOp[], mySession: number) {
    const { owner, storage } = deps;
    if (owner === null) return;
    const current = await storage.get();
    if (mySession !== session) return;
    if (current && current.owner !== owner) return;
    await (next.length === 0 ? storage.del() : storage.set({ owner, ops: next }));
  }

  function commit(next: QueuedOp[]) {
    queue = next;
    if (loaded && !disposed) void persist(next, session);
    for (const listener of listeners) listener();
  }

  async function flush() {
    if (!loaded || disposed || !canSend || draining) return;
    const mySession = session;
    draining = true;
    try {
      // Taps made during a drain are queued; keep going while each pass makes progress.
      while (queue.length > 0 && canSend) {
        const attempted = queue;
        const failed = await drain(attempted, (op) =>
          mySession === session ? send(op) : Promise.reject(new Error("disposed")),
        );
        if (mySession !== session) return;
        commit(settle(queue, attempted, failed));
        if (failed.length === attempted.length) break;
      }
    } finally {
      draining = false;
      // A newer session may have waited on this drain; let it go now.
      if (mySession !== session) void flush();
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
      const mySession = ++session;
      disposed = false;
      loaded = false;
      const stored = await deps.storage.get();
      if (mySession !== session) return;
      const mine = stored && canShowOffline(stored.owner, deps.owner) ? stored.ops : [];
      loaded = true;
      commit(mergeQueues(mine, queue));
      await flush();
    },
    dispose() {
      session++;
      disposed = true;
      loaded = false;
    },
    async tap(listItemId: Id<"listItems">, status: TapStatus, at: number) {
      if (disposed) return;
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
