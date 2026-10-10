import { expect, test, type Page } from "@playwright/test";
import {
  applyTestingToken,
  createTestingToken,
  requireDevelopmentKeys,
  signIn,
} from "./helpers/clerk";

// The desktop shell (DESIGN.md, Layout): at 1024px and wider the tab bar leaves and a left
// rail carries the four entries and Settings; the one 672px column sits beside it. Back at
// phone width, nothing of that remains.
//
// Signs in the existing UX capture user (a dev-instance test address with a household of
// its own) instead of minting one, and only reads. Opt-in with the clerk-week walk: it needs
// the Clerk keys and that user, so CI never runs it.
//   set -a; . ./.env.local; set +a; bun run build && E2E_CLERK_WEEK=1 bun run test:e2e
const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const keyed = process.env.E2E_CLERK_WEEK === "1";

const EMAIL = "larder.uxcapture+clerk_test@example.com";
const HOUSEHOLD = "UX capture";
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };
// --rail-width in src/styles.css; max-w-2xl.
const RAIL = 240;
const COLUMN = 672;

const rail = (page: Page) => page.locator('nav[aria-label="Sections"]');
const tabBar = (page: Page) => page.locator('nav[aria-label="Main"]');
const headerGear = (page: Page) => page.locator('header a[aria-label="Settings"]');

test.describe("desktop shell", () => {
  test.skip(!clerkConfigured || !keyed, "Opt-in: E2E_CLERK_WEEK=1 with the Clerk keys.");

  test("at 1280 the rail replaces the tab bar beside one column; at 390 the tab bar is back", async ({
    browser,
  }) => {
    requireDevelopmentKeys();
    const context = await browser.newContext({
      viewport: DESKTOP,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    });
    await applyTestingToken(context, await createTestingToken());
    const page = await context.newPage();
    await page.goto("/sign-in");
    await signIn(page, EMAIL);

    await page.goto("/week");
    await expect(rail(page)).toBeVisible();
    // The capture household and no other: everything after this only reads.
    await expect(rail(page).getByText(HOUSEHOLD, { exact: true })).toBeVisible();
    await expect(rail(page).getByRole("link")).toHaveText([
      "Week",
      "List",
      "Pantry",
      "Recipes",
      "Settings",
    ]);
    await expect(rail(page).getByRole("link", { name: "Week" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // In the DOM, but not shown: a missing element would pass toBeHidden on its own.
    await expect(tabBar(page)).toBeAttached();
    await expect(tabBar(page)).toBeHidden();
    await expect(headerGear(page)).toBeAttached();
    await expect(headerGear(page)).toBeHidden();

    const main = (await page.locator("main").boundingBox())!;
    expect(main.x).toBeGreaterThanOrEqual(RAIL);
    expect(main.width).toBeLessThanOrEqual(COLUMN);
    // The header spans the column alone, at the 48px the sticky headings are offset by.
    const header = (await page.locator("header").boundingBox())!;
    expect(header.x).toBe(main.x);
    expect(header.width).toBe(main.width);
    expect(Math.round(header.height)).toBe(49);

    // The Fab sits inside the column's right edge, on the inset rather than over a tab bar.
    await rail(page).getByRole("link", { name: "Pantry" }).click();
    await expect(page).toHaveURL(/\/pantry$/);
    const fab = (await page.getByRole("button", { name: "Add to pantry" }).boundingBox())!;
    expect(fab.x + fab.width).toBeLessThanOrEqual(main.x + main.width);
    expect(fab.x + fab.width).toBeGreaterThan(main.x + main.width - 32);
    expect(DESKTOP.height - (fab.y + fab.height)).toBe(16);

    await page.setViewportSize(PHONE);
    await expect(tabBar(page)).toBeVisible();
    await expect(headerGear(page)).toBeVisible();
    await expect(rail(page)).toBeAttached();
    await expect(rail(page)).toBeHidden();
    expect((await page.locator("main").boundingBox())!.x).toBe(0);

    await context.close();
  });
});
