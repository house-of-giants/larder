import { expect, test } from "@playwright/test";

// Runs against the built Nitro server (see playwright.config.ts). Store mode offline, with
// a real session, is step 05 of clerk-week.spec.ts.

test.describe("installable app", () => {
  test("the web manifest is served with the app's name", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      name: "Larder",
      short_name: "Larder",
      display: "standalone",
      start_url: "/week",
      scope: "/",
    });
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    expect(
      manifest.shortcuts.map(({ name, url }: { name: string; url: string }) => ({ name, url })),
    ).toEqual([
      { name: "Store", url: "/list" },
      { name: "Pantry", url: "/pantry" },
    ]);
  });

  test("every icon the manifest names is served, plain and maskable", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    const icons: { src: string; sizes: string; purpose?: string }[] = manifest.icons;
    expect(new Set(icons.map((icon) => icon.purpose ?? "any"))).toEqual(
      new Set(["any", "maskable"]),
    );
    for (const icon of icons) {
      const response = await request.get(icon.src);
      expect(response.status(), icon.src).toBe(200);
      expect(response.headers()["content-type"]).toBe("image/png");
    }
  });

  test("the home-screen tags are in the page head", async ({ page, request }) => {
    await page.goto("/");
    const head = page.locator("head");
    await expect(head.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      "content",
      "Larder",
    );
    await expect(
      head.locator('meta[name="apple-mobile-web-app-status-bar-style"]'),
    ).toHaveAttribute("content", "default");
    const touchIcon = head.locator('link[rel="apple-touch-icon"]');
    await expect(touchIcon).toHaveAttribute("sizes", "180x180");
    const href = await touchIcon.getAttribute("href");
    expect((await request.get(href!)).status()).toBe(200);
  });

  test("the service worker is served", async ({ request }) => {
    const response = await request.get("/sw.js");
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain("precacheAndRoute");
  });
});
