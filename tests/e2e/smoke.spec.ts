import { expect, test } from "@playwright/test";

// Runs against the built Nitro server, the same artifact Vercel serves. Which branch
// runs depends on whether Clerk keys were in the environment at build and boot time.
const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY,
);

test.describe("without Clerk keys", () => {
  test.skip(clerkConfigured, "Clerk keys are set; the configured suite runs instead.");

  test("the shell renders its setup screen", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("Larder");
    await expect(page.getByRole("heading", { name: "Larder" })).toBeVisible();
    await expect(page.getByText("Sign-in is not configured yet.")).toBeVisible();
  });
});

test.describe("with Clerk keys", () => {
  test.skip(!clerkConfigured, "No Clerk keys; the setup-screen suite runs instead.");

  test("an anonymous visitor is sent to sign in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page).toHaveTitle("Larder");
    // Clerk's sign-in card carries a form; its exact copy belongs to Clerk.
    await expect(page.locator("form").first()).toBeVisible();
    await expect(page.locator('[data-screen="sign-in"]')).toBeVisible();
  });

  test("a nested sign-in step still renders the sign-in screen", async ({ page }) => {
    const response = await page.goto("/sign-in/verify/factor-one");
    expect(response?.status()).toBe(200);
    await expect(page.getByText(/not found/i)).toHaveCount(0);
    await expect(page.locator('[data-screen="sign-in"]')).toBeVisible();
  });
});
