import { del, get, set } from "idb-keyval";
import { useConvexAuth, useConvexConnectionState, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { Id } from "../../convex/_generated/dataModel";
import { currentList, setItemStatus } from "#/components/list/list-data";
import type { TapStatus } from "#/components/list/types";
import { errorMessage } from "#/lib/errors";
import { applyOps } from "./overlay";
import { drain, enqueue, settle, type QueuedOp } from "./queue";
import { useOnline } from "./use-online";

const KEY = "queue:list";
// A socket can look open with no signal behind it. Past this, the tap is queued and
// replayed later; the write is idempotent, so a late arrival of the first try is harmless.
const SEND_TIMEOUT_MS = 8_000;

async function readQueue(): Promise<QueuedOp[]> {
  try {
    return (await get<QueuedOp[]>(KEY)) ?? [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedOp[]): Promise<void> {
  try {
    await (queue.length === 0 ? del(KEY) : set(KEY, queue));
  } catch {
    // No IndexedDB: the queue lives as long as the page does.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Check-offs that survive the aisle. With a signal a tap goes straight to Convex (with
 * an optimistic update); without one, or when the send fails, it joins a queue kept in
 * IndexedDB. The queue drains on mount, on reconnect, and when the network comes back.
 * `queued` is what the screen lays over the list so taps show at once either way.
 */
export function useListOps() {
  const online = useOnline();
  const { isAuthenticated } = useConvexAuth();
  const { isWebSocketConnected } = useConvexConnectionState();
  const canSend = online && isAuthenticated && isWebSocketConnected;

  const baseMutate = useMutation(setItemStatus);
  const mutate = useMemo(
    () =>
      baseMutate.withOptimisticUpdate((store, args) => {
        const list = store.getQuery(currentList, {});
        // Every tap here carries its time; `at` is optional only on the server.
        if (!list || args.at === undefined) return;
        store.setQuery(currentList, {}, applyOps(list, [{ ...args, at: args.at }]));
      }),
    [baseMutate],
  );

  const [queued, setQueued] = useState<QueuedOp[]>([]);
  const [loaded, setLoaded] = useState(false);
  const queueRef = useRef<QueuedOp[]>([]);
  const loadedRef = useRef(false);
  const draining = useRef(false);
  // The latest tap per item, so a slow failure never queues over a newer tap.
  const latest = useRef(new Map<Id<"listItems">, QueuedOp>());

  const commit = useCallback((next: QueuedOp[]) => {
    queueRef.current = next;
    setQueued(next);
    // Until the stored queue is read, writing would overwrite it; the load merges.
    if (loadedRef.current) void writeQueue(next);
  }, []);

  useEffect(() => {
    let current = true;
    void readQueue().then((stored) => {
      if (!current) return;
      loadedRef.current = true;
      // Taps made before the read finished are newer than anything stored.
      commit(queueRef.current.reduce(enqueue, stored));
      setLoaded(true);
    });
    return () => {
      current = false;
    };
  }, [commit]);

  const send = useCallback(
    async (op: QueuedOp) => {
      try {
        await withTimeout(mutate(op), SEND_TIMEOUT_MS);
      } catch (error) {
        // The server said no (the list closed, the item is gone): retrying will not help.
        if (error instanceof ConvexError) {
          toast(errorMessage(error));
          return;
        }
        throw error;
      }
    },
    [mutate],
  );

  const flush = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;
    try {
      // Taps made during a drain are queued; keep going while each pass makes progress.
      while (queueRef.current.length > 0) {
        const attempted = queueRef.current;
        const failed = await drain(attempted, send);
        commit(settle(queueRef.current, attempted, failed));
        if (failed.length === attempted.length) break;
      }
    } finally {
      draining.current = false;
    }
  }, [commit, send]);

  useEffect(() => {
    if (loaded && canSend && queued.length > 0) void flush();
  }, [loaded, canSend, queued.length, flush]);

  const setStatus = useCallback(
    async (listItemId: Id<"listItems">, status: TapStatus) => {
      const op: QueuedOp = { listItemId, status, at: Date.now() };
      latest.current.set(listItemId, op);
      // Straight to the server only when nothing older is waiting, so writes stay in order.
      if (!canSend || queueRef.current.length > 0 || draining.current) {
        commit(enqueue(queueRef.current, op));
        return;
      }
      try {
        await send(op);
      } catch {
        if (latest.current.get(listItemId) === op) commit(enqueue(queueRef.current, op));
      }
    },
    [canSend, commit, send],
  );

  return { setStatus, queued, pending: queued.length, online, canSend };
}
