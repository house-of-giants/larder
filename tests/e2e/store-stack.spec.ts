import { devices, expect, test } from "@playwright/test";
import {
  applyTestingToken,
  createTestingToken,
  requireDevelopmentKeys,
  signIn,
} from "./helpers/clerk";

// The store's sticky stack (DESIGN.md, Layout): the pinned progress-and-chips block sits
// above the aisle headings and below the tab bar, so a heading being pushed out at an aisle
// boundary never paints over the chips. Signs in the existing UX capture user and only
// reads. Opt-in with the clerk-week walk: it needs the Clerk keys and that user.
//   set -a; . ./.env.local; set +a; bun run build && E2E_CLERK_WEEK=1 bun run test:e2e
const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY,
);
const keyed = process.env.E2E_CLERK_WEEK === "1";
const EMAIL = "larder.uxcapture+clerk_test@example.com";

test.describe("store sticky stack", () => {
  test.skip(!clerkConfigured || !keyed, "Opt-in: E2E_CLERK_WEEK=1 with the Clerk keys.");

  test("the chip row paints over an aisle heading being pushed out", async ({ browser }) => {
    requireDevelopmentKeys();
    const context = await browser.newContext({
      ...devices["Pixel 7"],
      viewport: { width: 390, height: 844 },
    });
    await applyTestingToken(context, await createTestingToken());
    const page = await context.newPage();
    await page.goto("/sign-in");
    await signIn(page, EMAIL);
    await page.goto("/list");
    await expect(page.locator('[data-testid="list-row"]').first()).toBeVisible();

    // Scroll so the produce section's end sits inside the pinned block: its heading is then
    // mid push-out, overlapping the chip row. Ask what is painted at the chip row's centre.
    const pushOut = await page.evaluate(() => {
      const chips = document.querySelector('nav[aria-label="Store sections"] ul')!;
      const pinned = chips.closest("div.sticky")!;
      const section = document.getElementById("list-produce")!.closest("section")!;
      const heading = document.getElementById("list-produce")!.parentElement!;
      window.scrollTo(0, 0);
      const pinnedTop = parseFloat(getComputedStyle(pinned).top);
      const end = section.getBoundingClientRect().bottom + window.scrollY;
      window.scrollTo(0, end - pinnedTop - 60);
      const band = chips.getBoundingClientRect();
      const x = band.left + 24;
      const y = band.top + band.height / 2;
      const box = heading.getBoundingClientRect();
      const overlapping = box.bottom > y && box.top < y;
      const hit = document.elementFromPoint(x, y);
      return {
        overlapping,
        onChips: Boolean(hit?.closest('nav[aria-label="Store sections"]')),
      };
    });
    expect(pushOut.overlapping, "the produce heading overlaps the chip row's centre").toBe(true);
    expect(pushOut.onChips, "the chip row paints over the departing heading").toBe(true);
    await context.close();
  });
});
