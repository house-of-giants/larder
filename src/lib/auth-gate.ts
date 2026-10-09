import { auth } from "@clerk/tanstack-react-start/server";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { clerkConfigured } from "#/lib/clerk-config";

// Server-side half of the auth gate for every signed-in route. Anonymous visitors are
// sent to sign in. Without Clerk keys it lets the request through; the root route then
// renders its setup screen instead of any child route.
export const requireSignedIn = createServerFn({ method: "GET" }).handler(async () => {
  if (!clerkConfigured()) {
    return { userId: null };
  }
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated) {
    // href, not `to`: the sign-in screen is a catch-all route and this is its base path.
    throw redirect({ href: "/sign-in" });
  }
  return { userId };
});
