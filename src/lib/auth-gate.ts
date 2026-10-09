import { auth } from "@clerk/tanstack-react-start/server";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { clerkConfigured } from "#/lib/clerk-config";
import { signInRedirectHref } from "#/lib/redirect";

export { returnTo } from "#/lib/redirect";

// Server-side half of the auth gate for every signed-in route. Anonymous visitors are
// sent to sign in, carrying the page they asked for (an invite link must survive
// sign-in). Without Clerk keys it lets the request through; the root route then
// renders its setup screen instead of any child route.
//
// Call it from `beforeLoad` with the location being loaded:
//   beforeLoad: ({ location }) => requireSignedIn({ data: returnTo(location) })
export const requireSignedIn = createServerFn({ method: "GET" })
  .validator((data: { returnTo: string }) => data)
  .handler(async ({ data }) => {
    if (!clerkConfigured()) {
      return { userId: null };
    }
    const { isAuthenticated, userId } = await auth();
    if (!isAuthenticated) {
      // href, not `to`: the sign-in screen is a catch-all route and this is its base path.
      throw redirect({ href: signInRedirectHref(data.returnTo) });
    }
    return { userId };
  });
