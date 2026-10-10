import { expect, test } from "@playwright/test";

// The gallery is built in only when VITE_GALLERY is 1 at build time; this run sees the
// same environment the build did (`set -a; . ./.env.local; set +a` before both).
const galleryBuilt = process.env.VITE_GALLERY === "1";
// Without Clerk keys the root shows the setup screen in place of every page, this one too.
const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY,
);

test.describe("gallery, built in", () => {
  test.skip(!galleryBuilt, "VITE_GALLERY is not 1; the not-found check runs instead.");
  test.skip(!clerkConfigured, "No Clerk keys: the setup screen stands in for every page.");

  test.beforeEach(async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByRole("heading", { level: 1, name: "Gallery" })).toBeVisible();
    await page.waitForFunction(() => document.readyState === "complete");
    await page.evaluate(() => document.fonts.ready);
  });

  test("names the page and loads the self-hosted serif", async ({ page }) => {
    await expect(page).toHaveTitle("Gallery");
    const fonts = await page.evaluate(() => ({
      check: document.fonts.check('22px "Young Serif"'),
      // check() is also true when no face by that name exists; a loaded face is the proof.
      loaded: [...document.fonts].some(
        (face) => face.family.replaceAll('"', "") === "Young Serif" && face.status === "loaded",
      ),
      heading: getComputedStyle(document.querySelector("h1")!).fontFamily,
    }));
    expect(fonts).toEqual({
      check: true,
      loaded: true,
      heading: expect.stringMatching(/^"?Young Serif"?,/),
    });
  });

  test("sets nothing in a monospace face, the sheet included", async ({ page }) => {
    await page.getByRole("button", { name: "Open the sheet" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    const mono = await page.evaluate(() =>
      [...document.body.querySelectorAll("*")]
        .filter((el) => /mono/i.test(getComputedStyle(el).fontFamily))
        .map((el) => el.outerHTML.slice(0, 120)),
    );
    expect(mono).toEqual([]);
  });

  test("an amount's figure and unit are tomato 600; words with no figure stay quiet", async ({
    page,
  }) => {
    const column = page.getByRole("region", { name: "This theme" });
    // The computed style of the element holding a given run of text in a row's second line.
    const styleOf = (row: string, text: string) =>
      column
        .getByRole("listitem")
        .filter({ hasText: row })
        .evaluate((li, wanted) => {
          const walker = document.createTreeWalker(li, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.textContent?.trim() === wanted) {
              const style = getComputedStyle(node.parentElement!);
              return {
                color: style.color,
                weight: style.fontWeight,
                numeric: style.fontVariantNumeric,
              };
            }
          }
          return null;
        }, text);
    const tomato = "rgb(185, 58, 32)";
    expect(await styleOf("carrots", "1")).toEqual({
      color: tomato,
      weight: "600",
      numeric: "tabular-nums",
    });
    // The unit: tomato and 600 like its figure, but no tabular figures of its own.
    expect(await styleOf("carrots", "lb")).toEqual({
      color: tomato,
      weight: "600",
      numeric: "normal",
    });
    // An unchecked row whose amount is only words: quiet ink, regular weight.
    expect(await styleOf("kosher salt", "as needed")).toEqual({
      color: "rgb(119, 109, 99)",
      weight: "400",
      numeric: "normal",
    });
  });

  test("a row is a checkbox the whole width, and checking it lowers the aisle count", async ({
    page,
  }) => {
    const column = page.getByRole("region", { name: "This theme" });
    const carrots = column.getByRole("checkbox", { name: /^carrots/ });
    await expect(carrots).toHaveAttribute("aria-checked", "false");
    await expect(column.getByText("4 to get", { exact: true })).toBeVisible();
    await carrots.click();
    await expect(carrots).toHaveAttribute("aria-checked", "true");
    await expect(column.getByText("3 to get", { exact: true })).toBeVisible();
  });

  test("closing the sheet puts focus back on what opened it, the add button too", async ({
    page,
  }) => {
    const column = page.getByRole("region", { name: "This theme" });
    for (const name of ["Open the sheet", "Add something"]) {
      const opener = column.getByRole("button", { name, exact: true });
      await opener.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(opener).toBeFocused();
    }
  });
});

test.describe("gallery, not built in", () => {
  test.skip(galleryBuilt, "VITE_GALLERY is 1; the gallery suite runs instead.");
  test.skip(!clerkConfigured, "No Clerk keys: the setup screen stands in for every page.");

  test("the address is not found", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByRole("heading", { name: "Nothing at this address." })).toBeVisible();
  });
});
