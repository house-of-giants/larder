import { useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";
import { cleanAuthHref } from "#/lib/auth-params";

const CLEAN = "clean";
// The server render cannot see the browser's address or origin; it counts as not clean yet,
// and hydration then reads the real address.
const UNKNOWN = "unknown";
const noSubscription = () => () => {};

/**
 * False until the address bar carries only redirects the app honors; a Clerk card mounts
 * only after that, so it never reads one the app refused (src/lib/auth-params.ts). When
 * something has to go, the address is replaced with the cleaned one.
 */
export function useCleanAuthUrl(): boolean {
  // Re-reads the address on every navigation, the cleaning one included.
  useLocation({ select: (location) => location.href });
  const navigate = useNavigate();
  const target = useSyncExternalStore(
    noSubscription,
    () => cleanAuthHref(window.location.href, window.location.origin) ?? CLEAN,
    () => UNKNOWN,
  );

  useEffect(() => {
    if (target !== CLEAN && target !== UNKNOWN) void navigate({ href: target, replace: true });
  }, [target, navigate]);

  return target === CLEAN;
}
