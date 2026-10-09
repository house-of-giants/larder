import { useAuth } from "@clerk/tanstack-react-start";
import { del, get, set } from "idb-keyval";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { resolveIdentity } from "#/lib/offline-ownership";

const LAST_VERIFIED = "auth:lastVerifiedUserId";
// Everything this phone keeps for one user: the saved list, the check-off queue, and
// the service worker's copies of server-rendered pages (see vite.config.ts).
const USER_KEYS = ["list:current", "queue:list"];
const PAGES_CACHE = "pages";

async function readLastVerified(): Promise<string | null> {
  try {
    return (await get<string>(LAST_VERIFIED)) ?? null;
  } catch {
    return null;
  }
}

async function writeLastVerified(userId: string | null): Promise<void> {
  try {
    await (userId === null ? del(LAST_VERIFIED) : set(LAST_VERIFIED, userId));
  } catch {
    // No IndexedDB: nothing was saved for anyone either.
  }
}

/** Deletes the saved list, the queue, and the cached pages. */
export async function clearOfflineData(): Promise<void> {
  await Promise.all([
    ...USER_KEYS.map((key) => del(key).catch(() => undefined)),
    typeof caches === "undefined" ? undefined : caches.delete(PAGES_CACHE).catch(() => undefined),
  ]);
}

/** Sign-out and account deletion: clear everything and forget who was here. */
export async function forgetOfflineData(): Promise<void> {
  await clearOfflineData();
  await writeLastVerified(null);
}

type OfflineIdentity = { ready: boolean; verifiedUserId: string | null };

const OfflineIdentityContext = createContext<OfflineIdentity>({
  ready: false,
  verifiedUserId: null,
});

/**
 * Decides whose saved data may be shown. Online, that is the signed-in Clerk user, and a
 * different user (or none) than last time clears everything first. Offline, Clerk cannot
 * answer, so it is the last user verified online, or nobody. Screens that show saved
 * data wait for `ready`.
 */
export function OfflineIdentityProvider({ children }: { children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const [stored, setStored] = useState<string | null | undefined>(undefined);
  const [identity, setIdentity] = useState<OfflineIdentity>({
    ready: false,
    verifiedUserId: null,
  });

  useEffect(() => {
    void readLastVerified().then(setStored);
  }, []);

  useEffect(() => {
    if (stored === undefined) return;
    const decision = resolveIdentity(stored, { isLoaded, userId });
    let current = true;
    void (async () => {
      if (decision.clear) {
        setIdentity({ ready: false, verifiedUserId: null });
        await clearOfflineData();
      }
      if (decision.remember !== undefined && decision.remember !== stored) {
        await writeLastVerified(decision.remember);
      }
      if (!current) return;
      if (decision.remember !== undefined) setStored(decision.remember);
      setIdentity({ ready: true, verifiedUserId: decision.verifiedUserId });
    })();
    return () => {
      current = false;
    };
  }, [stored, isLoaded, userId]);

  return (
    <OfflineIdentityContext.Provider value={identity}>{children}</OfflineIdentityContext.Provider>
  );
}

export function useOfflineIdentity(): OfflineIdentity {
  return useContext(OfflineIdentityContext);
}
