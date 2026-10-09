import { useConvexAuth, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

/**
 * The signed-in member's household: `undefined` while loading, `null` when they have
 * not joined one. Waits for Convex to hold the Clerk token, so the query never runs
 * anonymously and trips the "Sign in first." guard.
 */
export function useHousehold() {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(api.households.current, isAuthenticated ? {} : "skip");
}
