import { describe, expect, it } from "vitest";
import { returnTo, signInRedirectHref } from "#/lib/redirect";
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

describe("invite links through sign-in", () => {
  const router = getRouter();

  it("the gate sends /join?code=abc to sign-in with the link as redirect_url", () => {
    const location = router.buildLocation({ to: "/join", search: { code: "abc" } });
    expect(signInRedirectHref(returnTo(location).returnTo)).toBe(
      "/sign-in?redirect_url=%2Fjoin%3Fcode%3Dabc",
    );
  });

  it.each(["/sign-in", "/sign-up"])("%s keeps a local redirect_url", (path) => {
    const leaf = router.matchRoutes(path, { redirect_url: "/join?code=abc" }).at(-1);
    expect(leaf?.search).toMatchObject({ redirect_url: "/join?code=abc" });
  });

  // Clerk's sign-in card links to sign-up with the return address as a full URL; the
  // screen reduces it with the page's origin, so the route must not drop it first.
  it.each(["/sign-in", "/sign-up"])("%s keeps an absolute redirect_url", (path) => {
    const url = "http://127.0.0.1:3100/join?code=abc";
    const leaf = router.matchRoutes(path, { redirect_url: url }).at(-1);
    expect(leaf?.search).toMatchObject({ redirect_url: url });
  });

  it.each(["/sign-in", "/sign-up"])("%s drops a redirect_url to another site", (path) => {
    // `search` is what Route.useSearch() hands the screen, raw params merged in.
    const leaf = router.matchRoutes(path, { redirect_url: "//evil.com" }).at(-1);
    expect(leaf?.routeId).toBe(`${path}/$`);
    expect(leaf?.search).toHaveProperty("redirect_url", undefined);
  });
});
