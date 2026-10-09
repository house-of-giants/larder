import { get, set } from "idb-keyval";
import { useEffect, useState } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { CurrentList } from "#/components/list/types";

// One saved copy of the list on this phone, replaced (never merged) every time the
// server's copy changes. It records whose list it is so a phone that switched
// households does not show the old one once the household is known.
const KEY = "list:current";

type Snapshot = { householdId: Id<"households"> | null; savedAt: number; list: CurrentList | null };

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
 * Saves every server copy of the list and hands back the saved one for when the server
 * has not answered. `undefined` while the saved copy is being read; `null` when there is
 * none for this household; otherwise the saved list (itself `null` when there was no list).
 */
export function useListSnapshot(
  live: CurrentList | null | undefined,
  householdId: Id<"households"> | null,
): { list: CurrentList | null } | null | undefined {
  const [snapshot, setSnapshot] = useState<Snapshot | null | undefined>(undefined);

  useEffect(() => {
    let current = true;
    void readSnapshot().then((stored) => {
      if (current) setSnapshot(stored ?? null);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (live === undefined) return;
    void writeSnapshot({ householdId, savedAt: Date.now(), list: live });
  }, [live, householdId]);

  if (!snapshot) return snapshot;
  if (householdId !== null && snapshot.householdId !== householdId) return null;
  return { list: snapshot.list };
}
