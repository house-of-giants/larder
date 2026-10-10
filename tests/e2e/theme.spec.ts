import { expect, test, type Page } from "@playwright/test";

// Keyless: the setup screen at / carries the same document head as every page, so the
// theme script, the class, and the theme-color meta are all here without Clerk.
const THEME_KEY = "larder:theme";
const LIGHT = "#f6f3ec";
const DARK = "#080811";

async function openWith(page: Page, stored: string | null) {
  await page.addInitScript(
    ([key, value]) => {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
      // What <html> looked like the moment <body> arrived: before any paint, and before
      // React hydrated.
      new MutationObserver((_, observer) => {
        if (!document.body) return;
        (window as unknown as { darkAtBody: boolean }).darkAtBody =
          document.documentElement.classList.contains("dark");
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    },
    [THEME_KEY, stored] as const,
  );
  await page.goto("/");
  await expect(page.getByText("Sign-in is not configured yet.")).toBeVisible();
}

async function themeState(page: Page) {
  return page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    darkAtBody: (window as unknown as { darkAtBody?: boolean }).darkAtBody,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    themeColor: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
  }));
}

test.describe("theme", () => {
  test("System follows a dark phone before first paint", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openWith(page, null);
    expect(await themeState(page)).toEqual({
      dark: true,
      darkAtBody: true,
      colorScheme: "dark",
      themeColor: DARK,
    });
  });

  test("System follows a light phone", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openWith(page, null);
    expect(await themeState(page)).toEqual({
      dark: false,
      darkAtBody: false,
      colorScheme: "light",
      themeColor: LIGHT,
    });
  });

  test("a saved Light wins over a dark phone", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await openWith(page, "light");
    expect(await themeState(page)).toMatchObject({
      dark: false,
      colorScheme: "light",
      themeColor: LIGHT,
    });
  });

  test("a saved Dark wins over a light phone", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openWith(page, "dark");
    expect(await themeState(page)).toMatchObject({
      dark: true,
      darkAtBody: true,
      colorScheme: "dark",
      themeColor: DARK,
    });
  });

  test("the .dark class alone flips color-scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openWith(page, null);
    const scheme = () =>
      page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(await scheme()).toBe("light");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    expect(await scheme()).toBe("dark");
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    expect(await scheme()).toBe("light");
  });

  for (const theme of ["light", "dark"] as const) {
    test(`setup screen screenshot, ${theme}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme });
      await openWith(page, theme);
      const path = testInfo.outputPath(`setup-${theme}.png`);
      await page.screenshot({ path, fullPage: true });
      await testInfo.attach(`setup-${theme}`, { path, contentType: "image/png" });
      // The page background really is the theme's paper, not the browser default.
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      expect(background).not.toBe("rgba(0, 0, 0, 0)");
      expect(await themeState(page)).toMatchObject({ dark: theme === "dark" });
    });
  }
});
