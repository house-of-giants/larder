import { expect, type BrowserContext, type Page } from "@playwright/test";

// Clerk's own test hooks for a development instance, without @clerk/testing:
// - A Testing Token on every Frontend API request skips bot protection
//   (https://clerk.com/docs/guides/development/testing/overview#testing-tokens).
// - An address of the form `name+clerk_test@example.com` gets no real email; its code is
//   always 424242 (https://clerk.com/docs/guides/development/testing/test-emails-and-phones).

export const TEST_CODE = "424242";

/**
 * Throws unless both Clerk keys are a development instance's (`pk_test_`, `sk_test_`). These
 * helpers mint Testing Tokens and sign up users; neither may ever touch production.
 */
export function requireDevelopmentKeys(): void {
  const publishable = process.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
  const secret = process.env.CLERK_SECRET_KEY ?? "";
  if (!publishable.startsWith("pk_test_") || !secret.startsWith("sk_test_")) {
    throw new Error(
      "Refusing to run: the Clerk keys are not a development instance's. " +
        "VITE_CLERK_PUBLISHABLE_KEY must start with pk_test_ and CLERK_SECRET_KEY with sk_test_; " +
        "this suite mints Testing Tokens and signs up users.",
    );
  }
}

/** A short-lived Testing Token for this instance, from the Backend API. */
export async function createTestingToken(): Promise<string> {
  requireDevelopmentKeys();
  const secret = process.env.CLERK_SECRET_KEY!;
  const response = await fetch("https://api.clerk.com/v1/testing_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok) throw new Error(`Testing Token request failed: ${response.status}`);
  const { token } = (await response.json()) as { token: string };
  return token;
}

/** Adds the Testing Token to every Frontend API request this context makes. */
export async function applyTestingToken(context: BrowserContext, token: string) {
  await context.route(/\.clerk\.accounts\.dev\/v1\//, async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("__clerk_testing_token", token);
    await route.continue({ url: url.toString() });
  });
}

/** Types the fixed test code into Clerk's code step; Clerk submits on the last digit. */
async function enterCode(page: Page) {
  const firstDigit = page.locator('input[inputmode="numeric"]').first();
  await expect(firstDigit).toBeVisible({ timeout: 20_000 });
  await firstDigit.click();
  await page.keyboard.type(TEST_CODE, { delay: 50 });
}

/** Leaves Clerk's card once the session exists and the app has taken over. */
async function leftAuth(page: Page) {
  await expect(page).not.toHaveURL(/\/sign-(in|up)/, { timeout: 30_000 });
}

/**
 * From the sign-in screen: Clerk's "Sign up" link, the email, the code. The address must be
 * new to the instance; a taken one fails here rather than quietly signing in.
 */
export async function signUp(page: Page, email: string) {
  requireDevelopmentKeys();
  await expect(page.locator('[data-screen="sign-in"]')).toBeVisible();
  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page.locator('[data-screen="sign-up"]')).toBeVisible();
  await page.locator('input[name="emailAddress"]').fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await enterCode(page);
  await leftAuth(page);
}

/** On the sign-in screen: the email, Continue, the code. */
export async function signIn(page: Page, email: string) {
  await expect(page.locator('[data-screen="sign-in"]')).toBeVisible();
  await page.locator('input[name="identifier"]').fill(email);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await enterCode(page);
  await leftAuth(page);
}
