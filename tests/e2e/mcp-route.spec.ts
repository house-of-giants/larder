import { expect, test } from "@playwright/test";

// The mounted /mcp route on the built server, through Start's own router. Keyless: no
// AGENT_SECRET here, which the refusals below must not depend on.

test.describe("the /mcp route", () => {
  for (const method of ["GET", "HEAD", "DELETE", "PUT", "PATCH", "OPTIONS"]) {
    test(`${method} is refused with 405 and Allow: POST`, async ({ request }) => {
      const response = await request.fetch("/mcp", { method });
      expect(response.status()).toBe(405);
      expect(response.headers()["allow"]).toBe("POST");
    });
  }

  test("a POST with no bearer token is a 401 with a Bearer challenge", async ({ request }) => {
    const response = await request.post("/mcp", {
      headers: { accept: "application/json, text/event-stream" },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
    });
    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toBe("Bearer");
    expect(await response.json()).toEqual({ error: "invalid_token" });
  });
});
