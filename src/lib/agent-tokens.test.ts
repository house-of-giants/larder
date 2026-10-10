import { describe, expect, it } from "vitest";
import { hashAgentToken, newAgentToken, sameSecret } from "./agent-tokens";

describe("newAgentToken", () => {
  it("is lard_ plus 32 random bytes in base64url (43 characters, no padding)", () => {
    expect(newAgentToken()).toMatch(/^lard_[A-Za-z0-9_-]{43}$/);
  });

  it("never repeats", () => {
    const tokens = new Set(Array.from({ length: 50 }, newAgentToken));
    expect(tokens.size).toBe(50);
  });
});

describe("hashAgentToken", () => {
  it("is the SHA-256 hex digest of the whole token", async () => {
    // Published test vector: SHA-256("abc").
    expect(await hashAgentToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("sameSecret", () => {
  it("accepts only the identical string", () => {
    expect(sameSecret("s3cret", "s3cret")).toBe(true);
    expect(sameSecret("s3cret", "s3creT")).toBe(false);
    expect(sameSecret("s3cret", "s3cret ")).toBe(false);
    expect(sameSecret("s3cret", "s3cre")).toBe(false);
    expect(sameSecret("", "s3cret")).toBe(false);
  });
});
