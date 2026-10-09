import { describe, expect, it } from "vitest";
import { canShowOffline, resolveIdentity } from "./ownership";

describe("canShowOffline", () => {
  it("shows a saved copy owned by the last verified user", () => {
    expect(canShowOffline("user_alice", "user_alice")).toBe(true);
  });

  it("never matches a missing owner, even against a missing user", () => {
    expect(canShowOffline(null, null)).toBe(false);
    expect(canShowOffline(undefined, undefined)).toBe(false);
    expect(canShowOffline(null, "user_alice")).toBe(false);
  });

  it("never shows a copy when no user was verified", () => {
    expect(canShowOffline("user_alice", null)).toBe(false);
  });

  it("does not show one user's copy to another", () => {
    expect(canShowOffline("user_alice", "user_bob")).toBe(false);
  });
});

describe("resolveIdentity", () => {
  it("trusts only the last verified user while the session is unknown (offline)", () => {
    expect(resolveIdentity("user_alice", { isLoaded: false, userId: null })).toEqual({
      verifiedUserId: "user_alice",
      clear: false,
      remember: undefined,
    });
    expect(resolveIdentity(null, { isLoaded: false, userId: null })).toEqual({
      verifiedUserId: null,
      clear: false,
      remember: undefined,
    });
  });

  it("keeps the saved data when the same user signs in again", () => {
    expect(resolveIdentity("user_alice", { isLoaded: true, userId: "user_alice" })).toEqual({
      verifiedUserId: "user_alice",
      clear: false,
      remember: "user_alice",
    });
  });

  it("clears everything when a different user signs in", () => {
    expect(resolveIdentity("user_alice", { isLoaded: true, userId: "user_bob" })).toEqual({
      verifiedUserId: "user_bob",
      clear: true,
      remember: "user_bob",
    });
  });

  it("clears whatever an unknown owner left when someone first signs in", () => {
    expect(resolveIdentity(null, { isLoaded: true, userId: "user_bob" })).toMatchObject({
      clear: true,
    });
  });

  it("clears everything and forgets the user once the session says signed out", () => {
    expect(resolveIdentity("user_alice", { isLoaded: true, userId: null })).toEqual({
      verifiedUserId: null,
      clear: true,
      remember: null,
    });
  });
});
