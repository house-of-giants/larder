import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("health.ping", () => {
  it("reports no identity for an anonymous caller", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.health.ping, {})).resolves.toEqual({ ok: true, signedIn: false });
  });

  it("reports the identity when the caller is signed in", async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({
      subject: "user_1",
      tokenIdentifier: "https://clerk.test|user_1",
    });
    await expect(asUser.query(api.health.ping, {})).resolves.toEqual({ ok: true, signedIn: true });
  });
});
