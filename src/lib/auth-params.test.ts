import { describe, expect, it } from "vitest";
import { cleanAuthHref } from "#/lib/auth-params";

// Clerk's sign-in and sign-up cards read their redirect parameters straight from the
// address bar, ahead of the props the app passes. Whatever the app would not honor has to
// leave the address bar before a card mounts.
describe("cleanAuthHref", () => {
  const origin = "https://larder.example";
  const at = (pathAndRest: string) => `${origin}${pathAndRest}`;

  it("leaves a sign-in with no redirect alone", () => {
    expect(cleanAuthHref(at("/sign-in"), origin)).toBeNull();
  });

  it("leaves a local redirect_url alone", () => {
    expect(cleanAuthHref(at("/sign-in?redirect_url=%2Fjoin%3Fcode%3Dabc"), origin)).toBeNull();
  });

  it("leaves a redirect_url on this origin alone", () => {
    const href = at(
      `/sign-up?redirect_url=${encodeURIComponent("https://larder.example/join?code=abc")}`,
    );
    expect(cleanAuthHref(href, origin)).toBeNull();
  });

  it("strips a redirect_url to another site", () => {
    expect(
      cleanAuthHref(at("/sign-in?redirect_url=https%3A%2F%2Fevil.example.com%2Fphish"), origin),
    ).toBe("/sign-in");
  });

  it("strips a redirect_url to a sibling subdomain", () => {
    expect(
      cleanAuthHref(at("/sign-in?redirect_url=https%3A%2F%2Fevil.larder.example%2F"), origin),
    ).toBe("/sign-in");
  });

  it("strips a protocol-relative redirect_url", () => {
    expect(cleanAuthHref(at("/sign-in?redirect_url=%2F%2Fevil.com"), origin)).toBe("/sign-in");
  });

  it.each([
    "sign_in_force_redirect_url",
    "sign_up_force_redirect_url",
    "sign_in_fallback_redirect_url",
    "sign_up_fallback_redirect_url",
  ])("strips %s whatever it holds", (name) => {
    expect(cleanAuthHref(at(`/sign-in?${name}=%2Fweek`), origin)).toBe("/sign-in");
  });

  it("keeps everything else, and the nested step's path", () => {
    expect(
      cleanAuthHref(
        at(
          "/sign-in/factor-one?keep=1&redirect_url=https%3A%2F%2Fevil.com&sign_up_force_redirect_url=%2Fx",
        ),
        origin,
      ),
    ).toBe("/sign-in/factor-one?keep=1");
  });

  it("cleans the query Clerk carries in the hash, keeping a URL on this origin", () => {
    const good = encodeURIComponent("https://larder.example/join?code=abc");
    const bad = encodeURIComponent("https://evil.com/");
    expect(cleanAuthHref(at(`/sign-up#/?redirect_url=${good}`), origin)).toBeNull();
    expect(cleanAuthHref(at(`/sign-up?redirect_url=%2Fjoin#/?redirect_url=${bad}`), origin)).toBe(
      "/sign-up?redirect_url=%2Fjoin#/",
    );
  });
});
