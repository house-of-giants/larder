import { expect, test, type Page } from "@playwright/test";

// Every page carries the same document head, so the theme script, the `.dark` class, and
// the theme-color meta can be checked on whichever page renders in this configuration:
// the setup screen at / without Clerk keys, the sign-in screen with them.
const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const THEME_KEY = "larder:theme";
const LIGHT = "#faf6ee";
const DARK = "#1e1a16";
// --background in src/styles.css, as the browser reports the body's computed color.
const BACKGROUND = { light: "rgb(250, 246, 238)", dark: "rgb(30, 26, 22)" };

type Screen = { path: string; ready: (page: Page) => Promise<void> };

const setupScreen: Screen = {
  path: "/",
  ready: (page) => expect(page.getByText("Sign-in is not configured yet.")).toBeVisible(),
};

const signInScreen: Screen = {
  path: "/sign-in",
  ready: (page) => expect(page.locator('[data-screen="sign-in"]')).toBeVisible(),
};

async function open(page: Page, screen: Screen, stored: string | null) {
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
  await page.goto(screen.path);
  await screen.ready(page);
  // Loaded, hydrated, and following the phone: useThemeSync marks <html> once it listens,
  // so any tag React would add to <head> is in by now.
  await page.waitForFunction(() => document.readyState === "complete");
  await expect(page.locator('html[data-theme-ready="1"]')).toBeAttached();
}

async function themeState(page: Page) {
  return page.evaluate(() => ({
    dark: document.documentElement.classList.contains("dark"),
    darkAtBody: (window as unknown as { darkAtBody?: boolean }).darkAtBody,
    colorScheme: getComputedStyle(document.documentElement).colorScheme,
    // Every theme-color tag: there must be exactly one.
    themeColors: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) =>
      m.getAttribute("content"),
    ),
    background: getComputedStyle(document.body).backgroundColor,
  }));
}

function themeTests(screen: Screen) {
  test("System follows a dark phone before first paint", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, screen, null);
    expect(await themeState(page)).toEqual({
      dark: true,
      darkAtBody: true,
      colorScheme: "dark",
      themeColors: [DARK],
      background: BACKGROUND.dark,
    });
  });

  test("System follows a light phone", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page, screen, null);
    expect(await themeState(page)).toEqual({
      dark: false,
      darkAtBody: false,
      colorScheme: "light",
      themeColors: [LIGHT],
      background: BACKGROUND.light,
    });
  });

  test("on System, the page follows the phone as it flips", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, screen, null);
    await page.emulateMedia({ colorScheme: "light" });
    await expect
      .poll(() => themeState(page))
      .toMatchObject({
        dark: false,
        colorScheme: "light",
        themeColors: [LIGHT],
        background: BACKGROUND.light,
      });
    await page.emulateMedia({ colorScheme: "dark" });
    await expect
      .poll(() => themeState(page))
      .toMatchObject({
        dark: true,
        themeColors: [DARK],
        background: BACKGROUND.dark,
      });
  });

  test("a saved Light wins over a dark phone", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await open(page, screen, "light");
    expect(await themeState(page)).toMatchObject({
      dark: false,
      colorScheme: "light",
      themeColors: [LIGHT],
      background: BACKGROUND.light,
    });
  });

  test("a saved Dark wins over a light phone", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page, screen, "dark");
    expect(await themeState(page)).toMatchObject({
      dark: true,
      darkAtBody: true,
      colorScheme: "dark",
      themeColors: [DARK],
      background: BACKGROUND.dark,
    });
  });

  test("the .dark class alone flips color-scheme", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await open(page, screen, null);
    const scheme = () =>
      page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(await scheme()).toBe("light");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    expect(await scheme()).toBe("dark");
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    expect(await scheme()).toBe("light");
  });

  for (const theme of ["light", "dark"] as const) {
    test(`screenshot, ${theme}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme });
      await open(page, screen, theme);
      const path = testInfo.outputPath(`${screen.path === "/" ? "setup" : "sign-in"}-${theme}.png`);
      await page.screenshot({ path, fullPage: true });
      await testInfo.attach(`${theme}`, { path, contentType: "image/png" });
      expect(await themeState(page)).toMatchObject({
        dark: theme === "dark",
        background: BACKGROUND[theme],
      });
    });
  }
}

// Clerk draws its card from the app's tokens over its own dark base theme; the card must
// follow the page into dark, and the app's tomato must win over the base theme's white
// primary.
function clerkCardTests() {
  for (const theme of ["light", "dark"] as const) {
    test(`Clerk's card follows the page, ${theme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await open(page, signInScreen, theme);
      const card = page.locator(".cl-card").first();
      await expect(card).toBeVisible();
      const colors = () =>
        page.evaluate(() => {
          const css = (selector: string) => {
            const el = document.querySelector(selector);
            return el ? getComputedStyle(el).backgroundColor : "";
          };
          return { card: css(".cl-card"), primary: css(".cl-formButtonPrimary") };
        });
      // Paper Card and Tomato for the theme, exactly; Clerk restyles as it mounts, so retry.
      await expect
        .poll(colors)
        .toEqual(
          theme === "dark"
            ? { card: "rgb(38, 33, 28)", primary: "rgb(238, 119, 87)" }
            : { card: "rgb(255, 253, 248)", primary: "rgb(185, 58, 32)" },
        );
    });
  }
}

test.describe("theme, without Clerk keys", () => {
  test.skip(clerkConfigured, "Clerk keys are set; the sign-in suite runs instead.");
  themeTests(setupScreen);
});

test.describe("theme, with Clerk keys", () => {
  test.skip(!clerkConfigured, "No Clerk keys; the setup-screen suite runs instead.");
  themeTests(signInScreen);
  clerkCardTests();
});
