import { describe, expect, it } from "vitest";
import { authUrl, localPath, signInRedirectHref } from "#/lib/redirect";

// `redirect_url` arrives from the address bar, so only a path on this site is honored;
// anything else would turn sign-in into an open redirect.
describe("localPath", () => {
  it("accepts a path on this site, search included", () => {
    expect(localPath("/join?code=abc")).toBe("/join?code=abc");
  });

  it.each([
    ["a protocol-relative URL", "//evil.com"],
    ["a backslash protocol-relative URL", "/\\evil.com"],
    ["an absolute URL", "https://evil.com"],
    ["an empty string", ""],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a non-string", 42],
    ["nothing", undefined],
  ])("rejects %s", (_label, value) => {
    expect(localPath(value)).toBeUndefined();
  });
});

describe("signInRedirectHref", () => {
  it("sends an anonymous visitor to sign in with the page they asked for", () => {
    expect(signInRedirectHref("/join?code=abc")).toBe("/sign-in?redirect_url=%2Fjoin%3Fcode%3Dabc");
  });

  it("drops a return path that is not local", () => {
    expect(signInRedirectHref("//evil.com")).toBe("/sign-in");
  });

  it("does not bother returning to the front door", () => {
    expect(signInRedirectHref("/")).toBe("/sign-in");
  });
});

describe("authUrl", () => {
  it("forwards the return path between sign-in and sign-up", () => {
    expect(authUrl("/sign-up", "/join?code=abc")).toBe(
      "/sign-up?redirect_url=%2Fjoin%3Fcode%3Dabc",
    );
  });

  it("is the bare path without one", () => {
    expect(authUrl("/sign-in", undefined)).toBe("/sign-in");
  });
});
