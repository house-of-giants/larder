// Whose offline data this phone may show. A saved list or queued tap belongs to the
// Clerk user who was verified online when it was written. Offline there is no session
// to ask, so only the last verified user counts, and a missing owner or user is never
// permission.

/** True only when both are known and the same. */
export function canShowOffline(
  owner: string | null | undefined,
  verified: string | null | undefined,
): boolean {
  return typeof owner === "string" && typeof verified === "string" && owner === verified;
}

export type IdentityDecision = {
  /** Whose saved data may be shown right now; null means nobody's. */
  verifiedUserId: string | null;
  /** Wipe the saved list, the queue, and the cached pages before showing anything. */
  clear: boolean;
  /** The new last-verified user to store; undefined leaves the stored one alone. */
  remember: string | null | undefined;
};

/**
 * Reconciles the last verified user (from IndexedDB) with the session. An unknown session
 * (Clerk not loaded, as when offline) falls back to the stored user. A known session
 * that differs from it, signed in as someone else or signed out, clears everything.
 */
export function resolveIdentity(
  stored: string | null,
  session: { isLoaded: boolean; userId: string | null | undefined },
): IdentityDecision {
  if (!session.isLoaded) return { verifiedUserId: stored, clear: false, remember: undefined };
  const userId = session.userId ?? null;
  if (userId === null) return { verifiedUserId: null, clear: stored !== null, remember: null };
  return { verifiedUserId: userId, clear: stored !== userId, remember: userId };
}
