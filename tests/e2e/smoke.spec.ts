import { expect, test } from "@playwright/test";

// The built server boots and renders the shell. With Clerk keys present the root
// redirects to sign-in; without them the shell renders its setup screen. Both carry
// the product name as the page title, which is what this smoke asserts.
test("the shell renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Larder/);
  await expect(
    page.getByRole("heading", { name: "Larder" }).or(page.getByText(/sign in/i).first()),
  ).toBeVisible();
});
