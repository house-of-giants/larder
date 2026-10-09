import { get, set } from "idb-keyval";
import { useEffect, useState } from "react";
import type { CurrentList } from "#/components/list/types";
import { canShowOffline } from "./ownership";

// One saved copy of the list on this phone, replaced (never merged) every time the
// server's copy changes, stamped with the Clerk user it was fetched for. It is cleared on
// sign-out and when someone else signs in (see identity.tsx).
const KEY = "list:current";

type Snapshot = { owner: string; savedAt: number; list: CurrentList | null };

async function readSnapshot(): Promise<Snapshot | undefined> {
  try {
    return await get<Snapshot>(KEY);
  } catch {
    // No IndexedDB (private window, blocked storage): nothing saved, nothing to show.
    return undefined;
  }
}

async function writeSnapshot(snapshot: Snapshot): Promise<void> {
  try {
    await set(KEY, snapshot);
  } catch {
    // Same as above; the live list still works.
  }
}

/**
 * Saves every server copy of the list for the verified user and hands back the newest
 * saved copy for when the server has not answered. `undefined` while it is being read;
 * `null` when there is none this user may see; otherwise the saved list (itself `null`
 * when there was no list).
 */
export function useListSnapshot(
  live: CurrentList | null | undefined,
  verifiedUserId: string | null,
): { list: CurrentList | null } | null | undefined {
  // What IndexedDB held at mount, and the newest server copy seen since. The newest one
  // wins, so a later gap in the server's answer falls back to it, not the mount-time copy.
  const [stored, setStored] = useState<Snapshot | null | undefined>(undefined);
  const [latest, setLatest] = useState<Pick<Snapshot, "owner" | "list"> | null>(null);
  if (
    live !== undefined &&
    verifiedUserId !== null &&
    (latest?.list !== live || latest.owner !== verifiedUserId)
  ) {
    setLatest({ owner: verifiedUserId, list: live });
  }

  useEffect(() => {
    let current = true;
    void readSnapshot().then((snapshot) => {
      if (current) setStored(snapshot ?? null);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (live === undefined || verifiedUserId === null) return;
    void writeSnapshot({ owner: verifiedUserId, savedAt: Date.now(), list: live });
  }, [live, verifiedUserId]);

  const snapshot = latest ?? stored;
  if (snapshot === undefined) return undefined;
  if (snapshot === null || !canShowOffline(snapshot.owner, verifiedUserId)) return null;
  return { list: snapshot.list };
}
