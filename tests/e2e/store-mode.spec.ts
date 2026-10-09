import { expect, test } from "@playwright/test";

// Runs against the built Nitro server (see playwright.config.ts).
const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY,
);
// Set by the orchestrator once a seeded household with a generated list has a signed-in
// session for the browser to reuse.
const listReady = process.env.E2E_LIST_READY === "1";

test.describe("installable app", () => {
  test("the web manifest is served with the app's name", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest).toMatchObject({ name: "Larder", short_name: "Larder", display: "standalone" });
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
  });

  test("the service worker is served", async ({ request }) => {
    const response = await request.get("/sw.js");
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("precacheAndRoute");
  });
});

test.describe("store mode offline", () => {
  test.skip(!clerkConfigured, "No Clerk keys; nobody can sign in.");
  test.skip(!listReady, "E2E_LIST_READY is not set; no seeded list to shop from.");

  test("check-offs made with no signal reach the server once it is back", async ({
    page,
    context,
  }) => {
    await page.goto("/list");
    const needed = page.locator('[data-testid="list-row"][data-status="needed"]');
    await expect(needed.first()).toBeVisible();
    expect(await needed.count()).toBeGreaterThanOrEqual(3);

    await context.setOffline(true);
    const checkedIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      // A checked row folds into the cart, so the next needed row is always first.
      const row = needed.first();
      const id = await row.getAttribute("data-item-id");
      expect(id).not.toBeNull();
      checkedIds.push(id!);
      await row.getByRole("checkbox").click();
      await expect(page.locator(`[data-item-id="${id}"]`)).toHaveAttribute(
        "data-status",
        "checked",
      );
    }
    const pill = page.getByTestId("sync-pill");
    await expect(pill).toHaveText("offline, 3 queued");

    await context.setOffline(false);
    await expect(pill).toBeHidden({ timeout: 30_000 });

    await page.reload();
    for (const id of checkedIds) {
      await expect(page.locator(`[data-item-id="${id}"]`)).toHaveAttribute(
        "data-status",
        "checked",
      );
    }
  });
});
