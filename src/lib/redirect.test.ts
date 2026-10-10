import { describe, expect, it } from "vitest";
import { authUrl, localPath, redirectParam, signInRedirectHref } from "#/lib/redirect";

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

// Clerk hands the return address on as a full URL when it moves between its sign-in and
// sign-up cards, so a URL on this app's own origin counts as local too.
describe("localPath on this origin", () => {
  const origin = "http://127.0.0.1:3100";

  it("reduces a URL on this origin to its path and search", () => {
    expect(localPath("http://127.0.0.1:3100/join?code=abc", origin)).toBe("/join?code=abc");
  });

  it("leaves the hash behind", () => {
    expect(localPath("http://127.0.0.1:3100/join?code=abc#top", origin)).toBe("/join?code=abc");
  });

  it("still accepts a plain path", () => {
    expect(localPath("/join?code=abc", origin)).toBe("/join?code=abc");
  });

  it.each([
    ["the same path on another origin", "https://evil.com/join?code=abc"],
    ["another port on this host", "http://127.0.0.1:3101/join?code=abc"],
    ["https on this host", "https://127.0.0.1:3100/join?code=abc"],
    ["a protocol-relative path on this origin", "http://127.0.0.1:3100//evil"],
    ["a protocol-relative URL", "//evil.com"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a file: URL", "file:///etc/passwd"],
    ["a control character", "http://127.0.0.1:3100/jo\tin"],
    ["a control character in a path", "/\n//evil.com"],
  ])("rejects %s", (_label, value) => {
    expect(localPath(value, origin)).toBeUndefined();
  });
});

// What the sign-in and sign-up routes keep from the address bar before the screen, which
// knows its origin, decides with localPath.
describe("redirectParam", () => {
  it.each([
    ["a path", "/join?code=abc"],
    ["an http URL", "http://127.0.0.1:3100/join?code=abc"],
    ["an https URL", "https://larder.example/join?code=abc"],
  ])("keeps %s", (_label, value) => {
    expect(redirectParam(value)).toBe(value);
  });

  it.each([
    ["a protocol-relative URL", "//evil.com"],
    ["a javascript: URL", "javascript:alert(1)"],
    ["a URL whose path is protocol-relative", "https://larder.example//evil.com"],
    ["a non-string", 42],
    ["nothing", undefined],
  ])("drops %s", (_label, value) => {
    expect(redirectParam(value)).toBeUndefined();
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
