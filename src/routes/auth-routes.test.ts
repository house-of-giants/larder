import { describe, expect, it } from "vitest";
import { getRouter } from "#/router";

// Clerk's <SignIn /> and <SignUp /> use path routing and push nested steps such as
// /sign-in/verify/factor-one. Those URLs must resolve to the same screens, or a
// reload mid-flow lands on "not found". (Found by the Phase 0 reviews.)
describe("auth routes", () => {
  const router = getRouter();

  it.each([
    ["/sign-in", "/sign-in/$"],
    ["/sign-in/verify/factor-one", "/sign-in/$"],
    ["/sign-in/sso-callback", "/sign-in/$"],
    ["/sign-up", "/sign-up/$"],
    ["/sign-up/verify-email-address", "/sign-up/$"],
  ])("%s renders the %s screen", (pathname, routeId) => {
    // A path nothing matches ends at the root match, so the leaf routeId is the whole check.
    const matches = router.matchRoutes(pathname, {});
    expect(matches.at(-1)?.routeId).toBe(routeId);
  });
});
