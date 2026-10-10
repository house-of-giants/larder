import { readFileSync } from "node:fs";
import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  applyTestingToken,
  deleteTestUser,
  createTestingToken,
  requireDevelopmentKeys,
  signIn,
  signUp,
} from "./helpers/clerk";
import { convexRun, householdIdByInviteCode } from "./helpers/convex";

// One household's week, end to end, with real Clerk sessions on the dev instance and the
// dev Convex deployment: sign-up, invites, the seeded week, the list, store mode offline,
// a cook, leftovers, closeout and its undo, sign-out. Three people, each in their own
// browser context. The households it makes are deleted at the end; the Clerk test users
// stay in the dev instance.
//
// One test, eight steps: each step needs the sessions and data the ones before it made.
// What a step proves is checked softly where the walk can go on without it, so one broken
// behavior is reported without hiding the ones after it; what the next step stands on is
// checked hard. A screenshot per step lands in test-results/clerk-week/.
//
// Needs the Clerk keys and CONVEX_DEPLOYMENT in the environment of both the server and
// this process, and SEED_ALLOWED on the dev deployment:
//   set -a; . ./.env.local; set +a; bun run build && E2E_CLERK_WEEK=1 bun run test:e2e
const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY,
);
// Opt-in: it mints Clerk test users and drives the Convex CLI, so CI never runs it.
const clerkWeek = process.env.E2E_CLERK_WEEK === "1";

// New addresses every run, so sign-up itself is what each run exercises.
const RUN = Date.now().toString(36);
const EMAIL = {
  one: `larder-one-${RUN}+clerk_test@example.com`,
  two: `larder-two-${RUN}+clerk_test@example.com`,
  three: `larder-three-${RUN}+clerk_test@example.com`,
};
const HOUSEHOLD = `Clerk week ${RUN}`;
const OTHER = "Other";
const SLIDERS = "Italian Grinder Sliders";
// The seeded week's first selected recipe, and so tonight's until it is made.
const BISCUITS = "Bacon, Egg and Pepper Jack Breakfast Biscuits";
// Sixteen ingredients: more rows than the Made it sheet shows at once on a phone.
const POT_ROAST = "Rosemary Balsamic Pot Roast with Carrots and Potatoes";

// The list the seeded week must produce, computed by hand before the generator existed.
type ExpectedList = {
  sectionOrder: string[];
  items: { section: string; status: "needed" | "onHand" }[];
};
const expectedList = JSON.parse(
  readFileSync(new URL("../../src/lib/__fixtures__/seeded-week-expected.json", import.meta.url), {
    encoding: "utf8",
  }),
) as ExpectedList;
const neededCount = expectedList.items.filter((i) => i.status === "needed").length;
const neededSections = expectedList.sectionOrder.filter((s) =>
  expectedList.items.some((i) => i.section === s && i.status === "needed"),
);

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/clerk-week/${name}.png`, fullPage: false });
}

/** The header line every signed-in screen carries: the household's name. */
const headerName = (page: Page, name: string) =>
  page.locator("header").getByText(name, { exact: true });

/** "N to get" at the top of store mode. */
const toGet = (page: Page, n: number) => page.getByText(new RegExp(`^${n} to get$`));

/** A pantry row by its exact name. */
const pantryRow = (page: Page, name: string) =>
  page.locator("main li").filter({ has: page.getByText(name, { exact: true }) });

/** The line under a pantry row's name: "22 tbsp", "Half", or "out". */
const pantryAmount = (page: Page, name: string) =>
  pantryRow(page, name).getByTestId("pantry-amount");

/**
 * Counts every Sonner toast that reaches the page from now on, even one already gone by the
 * time it is asked: a toast only has to exist for a moment to say the same thing twice.
 */
async function watchToasts(page: Page) {
  await page.evaluate(() => {
    const before = new Set(document.querySelectorAll("[data-sonner-toast]"));
    const seen = new Set<Element>();
    const w = window as unknown as { toastsSeen: () => number };
    const note = () =>
      document.querySelectorAll("[data-sonner-toast]").forEach((el) => {
        if (!before.has(el)) seen.add(el);
      });
    new MutationObserver(note).observe(document.body, { childList: true, subtree: true });
    w.toastsSeen = () => (note(), seen.size);
  });
  return () =>
    page.evaluate(() => (window as unknown as { toastsSeen: () => number }).toastsSeen());
}

/** A leftover card by its heading. */
const leftoverCard = (page: Page, name: string) =>
  page.locator("main li").filter({ has: page.getByRole("heading", { name }) });

/** The invite link from Settings, and the code in it. */
async function readInvite(page: Page) {
  await page.goto("/settings");
  const field = page.getByLabel("Invite link");
  await expect(field).toHaveValue(/\/join\?code=/);
  const url = await field.inputValue();
  return { url, code: new URL(url).searchParams.get("code")! };
}

test.describe("a week in one household, signed in with Clerk", () => {
  test.skip(!clerkConfigured, "No Clerk keys; nobody can sign in.");
  test.skip(
    !clerkWeek,
    "E2E_CLERK_WEEK is not set; this walk makes Clerk users on the dev instance.",
  );

  test("sign-up to sign-out, through invites, the list, a cook, and closeout", async ({
    browser,
  }, testInfo) => {
    test.setTimeout(600_000);
    // Before anything reaches Clerk: only a development instance may get test users.
    requireDevelopmentKeys();
    const token = await createTestingToken();
    const contexts: BrowserContext[] = [];
    const householdIds: string[] = [];

    async function newPerson() {
      const context = await browser.newContext({
        ...devices["Pixel 7"],
        baseURL: testInfo.project.use.baseURL,
      });
      await applyTestingToken(context, token);
      contexts.push(context);
      return context.newPage();
    }

    try {
      const one = await newPerson();
      let invite = { url: "", code: "" };

      await test.step("01 sign up, start a household, and Convex sees the Clerk session", async () => {
        await one.goto("/");
        await expect(one).toHaveURL(/\/sign-in/);
        await shot(one, "01a-anonymous-sign-in");

        await signUp(one, EMAIL.one);
        await expect(one).toHaveURL(/\/join/);
        // Only a Convex query run with a verified Clerk identity gets past the skeleton.
        await expect(
          one.getByText("Start a household", { exact: true }),
          "JWT template or issuer mismatch: /join never left its skeleton",
        ).toBeVisible({ timeout: 30_000 });
        await shot(one, "01b-join");

        await one.locator("#household-name").fill(HOUSEHOLD);
        await one.getByRole("button", { name: "Start a household", exact: true }).click();
        await expect(one).toHaveURL(/\/week$/);
        // households.current, rendered: the name is only in the signed-in member's row.
        await expect(headerName(one, HOUSEHOLD)).toBeVisible();
        await expect(one.getByText("No week started.")).toBeVisible();
        await shot(one, "01c-week-signed-in");
      });

      await test.step("02 an invite link brings a second person into the household", async () => {
        invite = await readInvite(one);
        householdIds.push(householdIdByInviteCode(invite.code));
        // The whole link shows, the code at its end included: nothing scrolls inside the field.
        // Measured only once the field is on screen with a size, so a hidden one cannot pass.
        const inviteField = one.getByLabel("Invite link");
        await expect(inviteField).toBeVisible();
        const box = await inviteField.boundingBox();
        expect.soft(box?.width ?? 0, "the invite field has a width").toBeGreaterThan(0);
        expect
          .soft(box?.height ?? 0, "the invite field is at least 44px tall")
          .toBeGreaterThanOrEqual(44);
        const shown = await inviteField.evaluate((field) => ({
          wide: field.scrollWidth <= field.clientWidth,
          tall: field.scrollHeight <= field.clientHeight,
        }));
        expect.soft(shown, "the invite link shows whole").toEqual({ wide: true, tall: true });
        await shot(one, "02a-settings-invite");

        const two = await newPerson();
        await two.goto(invite.url);
        await expect(two).toHaveURL(
          `/sign-in?redirect_url=${encodeURIComponent(`/join?code=${invite.code}`)}`,
        );
        await signUp(two, EMAIL.two);
        // Sign-up must bring the invite back: Clerk carries it to its sign-up card as a full URL.
        await expect(two, "the invite code survives sign-up").toHaveURL(
          `/join?code=${invite.code}`,
        );
        await expect(two.locator("#invite-code")).toHaveValue(invite.code);
        await shot(two, "02b-join-prefilled");

        await two.getByRole("button", { name: "Join", exact: true }).click();
        await expect(two).toHaveURL(/\/week$/);
        await expect(headerName(two, HOUSEHOLD)).toBeVisible();
        await shot(two, "02c-second-member-week");

        await one.reload();
        const members = one.locator('section[aria-labelledby="members-heading"] li');
        await expect.soft(members).toHaveCount(2);
        await expect.soft(members.filter({ hasText: "(you)" })).toHaveCount(1);
        await shot(one, "02d-two-members");
      });

      await test.step("03 someone already in a household cannot join another", async () => {
        const three = await newPerson();
        await three.goto("/");
        await expect(three).toHaveURL(/\/sign-in/);
        await signUp(three, EMAIL.three);
        await expect(three.getByText("Start a household", { exact: true })).toBeVisible({
          timeout: 30_000,
        });
        await three.locator("#household-name").fill(OTHER);
        await three.getByRole("button", { name: "Start a household", exact: true }).click();
        await expect(headerName(three, OTHER)).toBeVisible();
        householdIds.push(householdIdByInviteCode((await readInvite(three)).code));

        // The join screen sends a member straight to their own week: the Join form, and with
        // it households.join's "You are already in a household.", is never offered.
        await three.goto(invite.url);
        await expect.soft(three).toHaveURL(/\/week$/);
        await expect.soft(three.getByRole("button", { name: "Join", exact: true })).toHaveCount(0);
        await expect.soft(headerName(three, OTHER)).toBeVisible();
        await expect.soft(three.getByText(HOUSEHOLD)).toHaveCount(0);
        await shot(three, "03-already-in-other");
      });

      await test.step("04 the seeded week plans, reconciles, and makes the list", async () => {
        convexRun("seed:load", { householdId: householdIds[0] });

        await one.goto("/week");
        await expect.soft(one.getByText(/^7 recipes$/)).toBeVisible();
        // One tomato control on the screen (DESIGN.md, the One Tomato Rule): Make the list.
        const pills = one.locator(':is(button, a)[data-variant="pill"]').filter({ visible: true });
        await expect.soft(pills).toHaveCount(1);
        await expect.soft(pills).toHaveText("Make the list");
        // Tonight is the first selected recipe with no cook yet.
        await expect
          .soft(one.getByRole("region", { name: "Tonight" }).getByRole("heading"))
          .toHaveText(BISCUITS);
        await expect.soft(one.locator('nav[aria-label="Main"] a')).toHaveCount(4);
        await shot(one, "04a-seeded-week");

        await one.goto("/week/plan");
        const sliders = one
          .locator("li")
          .filter({ has: one.getByText(SLIDERS, { exact: true }) })
          .filter({ has: one.getByLabel("Batches") });
        const batches = sliders.getByLabel("Batches");
        const pick = (text: string) => sliders.getByRole("button", { name: text, exact: true });
        // One batches control everywhere: the picks first, then the typed field.
        const picksFirst = await batches.evaluate(
          (field, first) => {
            const picks = [...first!.closest("fieldset")!.querySelectorAll("button")];
            return (
              picks.length === 3 &&
              picks.every(
                (b) => b.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
              )
            );
          },
          await pick("1/2").elementHandle(),
        );
        expect.soft(picksFirst, "the picks come before the typed field").toBe(true);
        // The typed field opens only on Other…, and is a draft until it loses focus.
        await expect.soft(batches).toBeHidden();
        await sliders.getByRole("button", { name: "Other…" }).click();
        await batches.fill("2");
        await batches.blur();
        // A typed amount that is done closes the field; no field is left open on its own.
        await expect.soft(batches).toBeHidden();
        await expect.soft(pick("2")).toHaveAttribute("aria-pressed", "true");
        await shot(one, "04b-plan-sliders-2");
        await sliders.getByRole("button", { name: "Other…" }).click();
        await batches.fill("1");
        await batches.blur();
        await expect(pick("1")).toHaveAttribute("aria-pressed", "true");

        await one.goto("/week");
        await one.getByRole("button", { name: "Make the list", exact: true }).click();
        await expect(one).toHaveURL(/\/list\/reconcile$/);
        await expect(one.getByRole("heading", { name: "Before you shop" })).toBeVisible();
        const butter = one.locator("main li").filter({ hasText: "unsalted butter" });
        await expect.soft(butter).toContainText("The week needs 22 tbsp");
        await expect.soft(butter.locator("input")).toHaveValue("5");
        await shot(one, "04c-reconcile");

        // An edit the field has not saved yet still counts: change butter and tap Looks
        // right at once; the list is made again from 6 on hand, so 16 tbsp to buy.
        await butter.locator("input").fill("6");
        await one.getByRole("button", { name: "Looks right" }).click();
        await expect(one).toHaveURL(/\/list$/);
        await expect
          .soft(one.locator('[data-testid="list-row"]').filter({ hasText: "unsalted butter" }))
          .toContainText("16 tbsp");
        await expect.soft(toGet(one, neededCount)).toBeVisible();
        const sections = one.locator('main section[aria-labelledby^="list-"]');
        await expect.soft(sections).toHaveCount(neededSections.length);
        const order = await sections.evaluateAll((els) =>
          els.map((el) => el.getAttribute("aria-labelledby")!.replace(/^list-/, "")),
        );
        expect.soft(order, "sections in store order").toEqual(neededSections);
        await shot(one, "04d-list");
      });

      await test.step("05 check-offs made offline reach the server and the pantry", async () => {
        await one.goto("/list");
        const needed = one.locator('[data-testid="list-row"][data-status="needed"]');
        await expect(needed.first()).toBeVisible();
        const butterId = (await needed
          .filter({ hasText: "unsalted butter" })
          .getAttribute("data-item-id"))!;
        const others = await needed.evaluateAll(
          (rows, skip) =>
            rows.map((r) => r.getAttribute("data-item-id")!).filter((id) => id !== skip),
          butterId,
        );
        const checkedIds = [butterId, others[0], others[1]];

        await one.context().setOffline(true);
        for (const id of checkedIds) {
          const row = one.locator(`[data-item-id="${id}"]`);
          await row.getByRole("checkbox").click();
          await expect(row).toHaveAttribute("data-status", "checked");
        }
        const pill = one.getByTestId("sync-pill");
        await expect.soft(pill).toHaveText("offline, 3 queued");
        await shot(one, "05a-offline-3-queued");

        await one.context().setOffline(false);
        await expect.soft(pill).toBeHidden({ timeout: 30_000 });
        await one.reload();
        for (const id of checkedIds) {
          await expect
            .soft(one.locator(`[data-item-id="${id}"]`))
            .toHaveAttribute("data-status", "checked");
        }
        await expect.soft(toGet(one, neededCount - 3)).toBeVisible();
        await shot(one, "05b-back-online");

        // A checked row stays in its aisle, after the rows still to get.
        const dairy = one.locator('main section[aria-labelledby="list-dairy_refrigerated"]');
        await expect.soft(dairy.locator(`[data-item-id="${butterId}"]`)).toHaveCount(1);
        const order = await dairy
          .locator('[data-testid="list-row"]')
          .evaluateAll((rows) => rows.map((r) => r.getAttribute("data-status")));
        expect
          .soft(order, "dairy has rows to get and rows in the cart")
          .toEqual(expect.arrayContaining(["needed", "checked"]));
        expect
          .soft(order, "checked rows sink to the end of their aisle")
          .toEqual([...order].sort((a, b) => Number(a === "checked") - Number(b === "checked")));

        // The chip row scrolls sideways and fades at its edge.
        const chips = await one.locator('nav[aria-label="Store sections"] ul').evaluate((ul) => ({
          overflows: ul.scrollWidth > ul.clientWidth,
          mask: getComputedStyle(ul).maskImage || getComputedStyle(ul).webkitMaskImage,
        }));
        expect.soft(chips.overflows, "chip row scrolls").toBe(true);
        expect.soft(chips.mask, "chip row fades").not.toBe("none");

        // Scrolled, the pinned progress line and chips sit flush under the app header.
        await one.evaluate(() => window.scrollTo(0, 600));
        const pinned = await one.evaluate(() => {
          const header = document.querySelector("header")!.getBoundingClientRect();
          const block = document
            .querySelector('nav[aria-label="Store sections"]')!
            .parentElement!.getBoundingClientRect();
          return { headerBottom: header.bottom, blockTop: block.top, height: block.height };
        });
        expect
          .soft(pinned.blockTop, "pinned block starts at the header's edge")
          .toBeCloseTo(pinned.headerBottom, 0);
        expect.soft(pinned.height, "pinned block stays short").toBeLessThan(88);

        // Sticky headings never paint over the tab bar: put the dairy heading under the
        // Recipes tab's centre, then ask what is painted there.
        const paint = await one.evaluate(() => {
          const link = document.querySelector('nav[aria-label="Main"] a[href="/recipes"]')!;
          const tab = link.getBoundingClientRect();
          const x = tab.x + tab.width / 2;
          const y = tab.y + tab.height / 2;
          const heading = document.getElementById("list-dairy_refrigerated")!.parentElement!;
          window.scrollTo(0, 0);
          const flow = heading.getBoundingClientRect();
          window.scrollTo(0, flow.top + flow.height / 2 - y);
          const box = heading.getBoundingClientRect();
          const under = box.left <= x && x <= box.right && box.top <= y && y <= box.bottom;
          const hit = document.elementFromPoint(x, y);
          return { under, onTop: Boolean(hit?.closest('nav[aria-label="Main"]')) };
        });
        expect.soft(paint.under, "the dairy heading sits under the Recipes tab").toBe(true);
        expect.soft(paint.onTop, "the tab bar paints over sticky headings").toBe(true);

        // 6 tbsp on hand (set in reconcile) plus the 16 bought.
        await one.goto("/pantry");
        await expect.soft(pantryAmount(one, "unsalted butter")).toHaveText("22 tbsp");
        await one.getByLabel("Find in the pantry").fill("butter");
        await shot(one, "05c-pantry-butter-22");
      });

      await test.step("06 Made it takes from the pantry and fills the leftovers", async () => {
        // Tonight's pale Made it: the biscuits, the week's first selected recipe.
        await one.goto("/week");
        const tonight = one.getByRole("region", { name: "Tonight" });
        await tonight.getByRole("button", { name: "Made it", exact: true }).click();
        const sheet = one.getByRole("dialog");
        await expect(sheet.getByRole("list", { name: "Ingredients used" })).toBeVisible();
        await expect.soft(sheet.getByText("1 batch makes", { exact: true })).toBeVisible();
        await expect.soft(sheet.getByText("8 biscuits", { exact: true })).toBeVisible();
        let toastsSeen = await watchToasts(one);
        await sheet.getByRole("button", { name: "Made it", exact: true }).click();
        // The sheet stays on its summary while Tonight moves on to the next recipe behind it
        // (the open sheet hides the page from the accessibility tree, so CSS finds it).
        await expect
          .soft(sheet.getByText("8 biscuits in the fridge.", { exact: true }))
          .toBeVisible();
        await expect.soft(one.locator('section[aria-label="Tonight"] h2')).not.toHaveText(BISCUITS);
        // The sheet is the confirmation; nothing says it again in a toast.
        await one.waitForTimeout(1_000);
        expect.soft(await toastsSeen(), "no toast after Made it").toBe(0);
        await shot(one, "06a-tonight-summary");
        await sheet.getByRole("button", { name: "Done" }).click();
        // The rows hold no verbs: the biscuits row says when it was made.
        await expect
          .soft(one.locator("main li").filter({ hasText: BISCUITS }))
          .toContainText(/Made /);
        await expect
          .soft(one.locator("main li").getByRole("button", { name: "Made it" }))
          .toHaveCount(0);

        // A second recipe from its own page, reached through its row.
        await one.locator("main li").getByRole("link", { name: SLIDERS }).click();
        await expect(one).toHaveURL(/\/recipes\//);
        await one.getByRole("button", { name: "Made it", exact: true }).click();
        await expect
          .soft(sheet.getByRole("button", { name: "1", exact: true }))
          .toHaveAttribute("aria-pressed", "true");
        await expect(sheet.getByRole("list", { name: "Ingredients used" })).toBeVisible();
        await shot(one, "06b-made-it-sheet");
        toastsSeen = await watchToasts(one);
        await sheet.getByRole("button", { name: "Made it", exact: true }).click();
        await expect
          .soft(sheet.getByText("12 sliders in the fridge.", { exact: true }))
          .toBeVisible();
        await one.waitForTimeout(1_000);
        expect.soft(await toastsSeen(), "no toast after Made it").toBe(0);
        await shot(one, "06c-made-it-summary");
        await sheet.getByRole("button", { name: "Done" }).click();

        // A long recipe on a 390 x 844 phone: the sheet stops short of the top and its body
        // scrolls, so the last row and the Made it pill are both reachable.
        const viewport = one.viewportSize();
        await one.setViewportSize({ width: 390, height: 844 });
        await one.goto("/week");
        await one.locator("main li").getByRole("link", { name: POT_ROAST }).click();
        await expect(one).toHaveURL(/\/recipes\//);
        await one.getByRole("button", { name: "Made it", exact: true }).click();
        const roastRows = sheet.getByRole("list", { name: "Ingredients used" });
        await expect(roastRows).toBeVisible();
        const body = sheet.locator('[data-slot="half-sheet-body"]');
        const pill = sheet.getByRole("button", { name: "Made it", exact: true });
        // Measured once the sheet has finished rising.
        await sheet.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
        const pillBefore = await pill.boundingBox();
        const scroll = await body.evaluate((el) => ({
          scrolls: el.scrollHeight > el.clientHeight,
          sheetHeight: el.closest('[role="dialog"]')!.getBoundingClientRect().height,
        }));
        expect
          .soft(await roastRows.locator(":scope > li").count(), "the pot roast's rows")
          .toBeGreaterThanOrEqual(14);
        expect.soft(scroll.scrolls, "the sheet's body scrolls").toBe(true);
        expect
          .soft(scroll.sheetHeight, "the sheet stays under 92dvh")
          .toBeLessThanOrEqual(844 * 0.92 + 1);
        // Scrolled to its end, the last row shows and the pill has not moved.
        await body.evaluate((el) => el.scrollTo(0, el.scrollHeight));
        await expect.soft(roastRows.locator(":scope > li").last()).toBeInViewport();
        expect.soft(await pill.boundingBox(), "the Made it pill stays put").toEqual(pillBefore);
        await shot(one, "06c2-long-sheet");
        await sheet.getByRole("button", { name: "Close" }).click();
        await expect(sheet).toBeHidden();
        if (viewport) await one.setViewportSize(viewport);

        await one.goto("/pantry");
        for (const name of ["Hawaiian rolls", "sliced ham"]) {
          await expect.soft(pantryAmount(one, name)).toHaveText("out");
        }
        await expect.soft(pantryAmount(one, "Italian seasoning")).toHaveText("Half");
        // The level chips live in the item sheet now, one tap from the row.
        await pantryRow(one, "Italian seasoning").getByRole("button").first().click();
        await expect
          .soft(one.getByRole("dialog").getByRole("button", { name: "Half" }))
          .toHaveAttribute("aria-pressed", "true");
        await one.getByRole("dialog").getByRole("button", { name: "Close" }).click();
        // 22 after shopping, less the 9 tbsp the biscuits used and the 2 the sliders did.
        await expect.soft(pantryAmount(one, "unsalted butter")).toHaveText("11 tbsp");
        await shot(one, "06d-pantry-after-cooks");

        await one.goto("/leftovers");
        const sliders = leftoverCard(one, SLIDERS);
        await expect.soft(sliders).toContainText("12 sliders");
        await expect.soft(leftoverCard(one, BISCUITS)).toContainText("8 biscuits");
        await sliders.getByRole("button", { name: "Ate one" }).click();
        await expect.soft(sliders).toContainText("11 sliders");
        await shot(one, "06e-leftovers-11");
      });

      await test.step("07 closing the week, and taking it back", async () => {
        await one.goto("/closeout");
        await expect
          .soft(
            one
              .locator("main li")
              .filter({ hasText: SLIDERS })
              .getByRole("radio", { name: "All eaten" }),
          )
          .toBeChecked();
        await shot(one, "07a-closeout");
        await one.getByRole("button", { name: "Close the week" }).click();
        // One line to confirm, then the closeout runs.
        const confirm = one.getByRole("dialog");
        await expect
          .soft(confirm)
          .toContainText(/Count the leftovers as eaten and start the week of /);
        await shot(one, "07b-confirm");
        await confirm.getByRole("button", { name: "Close the week" }).click();
        await expect(one).toHaveURL(/\/week$/);
        await expect.soft(one.locator("main p").filter({ hasText: "· planning ·" })).toBeVisible();
        await expect.soft(one.getByText("No recipes picked yet.")).toBeVisible();
        await expect.soft(one.getByText("fridge empty", { exact: true })).toBeVisible();
        const closedToast = one
          .locator("[data-sonner-toast]")
          .filter({ hasText: "Week closed. A new one is ready to plan." });
        await shot(one, "07c-new-week");
        // The toast's Undo takes back this closeout's events, all at once.
        await closedToast.getByRole("button", { name: "Undo" }).click();
        await expect.soft(one.getByText("Undone.", { exact: true })).toBeVisible();
        await expect.soft(one.getByText("2 in the fridge", { exact: true })).toBeVisible();

        await one.goto("/leftovers");
        await expect.soft(leftoverCard(one, SLIDERS)).toContainText("11 sliders");
        await expect.soft(leftoverCard(one, BISCUITS)).toContainText("8 biscuits");
        await shot(one, "07d-leftovers-back");

        // The drawer agrees: the closeout row is undone and offers nothing more.
        await one.goto("/settings");
        await one.getByRole("button", { name: "Recent changes" }).click();
        const drawer = one.getByRole("dialog");
        // Exact, so the "Undone: Closed out ..." line the undo adds is not this row.
        const closed = drawer
          .locator("li")
          .filter({ has: one.getByText(`Closed out ${SLIDERS}: eaten`, { exact: true }) });
        await expect(closed).toBeVisible();
        await expect.soft(closed.getByRole("button", { name: "Undo" })).toHaveCount(0);
        await expect.soft(closed).toContainText("Undone.");
        await shot(one, "07e-undo-drawer");
      });

      await test.step("08 signing out, and back in", async () => {
        await one.goto("/settings");
        await one.getByRole("button", { name: "Sign out" }).click();
        await expect(one).toHaveURL(/\/sign-in/);
        await shot(one, "08a-signed-out");

        await one.goto("/week");
        await expect(one).toHaveURL(`/sign-in?redirect_url=${encodeURIComponent("/week")}`);
        await signIn(one, EMAIL.one);
        await expect(one).toHaveURL(/\/week$/);
        await expect(headerName(one, HOUSEHOLD)).toBeVisible();
        await shot(one, "08b-signed-back-in");
      });
    } finally {
      for (const householdId of householdIds) {
        convexRun("testing:deleteDevHousehold", { householdId });
      }
      for (const context of contexts) await context.close();
      // The three sign-ups come off the development instance, which caps at 100 users.
      for (const email of Object.values(EMAIL)) await deleteTestUser(email);
    }
  });
});
