import { del, get, set } from "idb-keyval";
import { useConvexAuth, useConvexConnectionState, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import type { Id } from "../../convex/_generated/dataModel";
import { currentList, setItemStatus } from "#/components/list/list-data";
import type { TapStatus } from "#/components/list/types";
import { errorMessage } from "#/lib/errors";
import { createListOps, type QueueStorage, type StoredQueue } from "./list-ops-store";
import { applyOps } from "./overlay";
import type { QueuedOp } from "./queue";
import { useOnline } from "./use-online";

const KEY = "queue:list";
// A socket can look open with no signal behind it. Past this, the tap is queued and
// replayed later; the write is idempotent, so a late arrival of the first try is harmless.
const SEND_TIMEOUT_MS = 8_000;

// The phone's one queue slot. Ownership checks live in the store (list-ops-store.ts).
const storage: QueueStorage = {
  get: () => get<StoredQueue>(KEY).catch(() => undefined),
  // No IndexedDB: the queue lives as long as the page does.
  set: (value) => set(KEY, value).catch(() => undefined),
  del: () => del(KEY).catch(() => undefined),
};

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
 * Check-offs that survive the aisle, for the verified user `owner` (mount it keyed by
 * owner). The queue logic lives in list-ops-store.ts; this wires it to Convex (with an
 * optimistic update), IndexedDB, and the connection. `queued` is what the screen lays
 * over the list so taps show at once either way.
 */
export function useListOps(owner: string | null) {
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
  const [ops] = useState(() =>
    createListOps({
      owner,
      storage,
      // Replaced by the effect below before anything is sent.
      send: () => Promise.reject(new Error("not ready")),
    }),
  );
  useEffect(() => {
    ops.setSend(send);
  }, [ops, send]);
  const queued = useSyncExternalStore(ops.subscribe, ops.getQueue, ops.getQueue);

  // Unmounting (including on an identity change, since the screen is keyed by owner)
  // ends this store's session, so a late read or drain cannot touch the next user's queue.
  useEffect(() => {
    void ops.load();
    return () => ops.dispose();
  }, [ops]);
  useEffect(() => {
    ops.setCanSend(canSend);
  }, [ops, canSend]);

  const setStatus = useCallback(
    (listItemId: Id<"listItems">, status: TapStatus) => ops.tap(listItemId, status, Date.now()),
    [ops],
  );

  return { setStatus, queued, pending: queued.length, online, canSend };
}
