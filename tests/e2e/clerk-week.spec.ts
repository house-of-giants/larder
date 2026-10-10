import { readFileSync } from "node:fs";
import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  applyTestingToken,
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

/** A pantry row by its exact name; its first button carries the name and the amount. */
const pantryRow = (page: Page, name: string) =>
  page.locator("main li").filter({ has: page.getByText(name, { exact: true }) });

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
        await one.getByRole("button", { name: "Start", exact: true }).click();
        await expect(one).toHaveURL(/\/week$/);
        // households.current, rendered: the name is only in the signed-in member's row.
        await expect(headerName(one, HOUSEHOLD)).toBeVisible();
        await expect(one.getByText("No week started.")).toBeVisible();
        await shot(one, "01c-week-signed-in");
      });

      await test.step("02 an invite link brings a second person into the household", async () => {
        invite = await readInvite(one);
        householdIds.push(householdIdByInviteCode(invite.code));
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
        await three.getByRole("button", { name: "Start", exact: true }).click();
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
        await shot(one, "04a-seeded-week");

        await one.goto("/week/plan");
        const sliders = one
          .locator("li")
          .filter({ has: one.getByText(SLIDERS, { exact: true }) })
          .filter({ has: one.getByLabel("Batches") });
        const batches = sliders.getByLabel("Batches");
        const pick = (text: string) => sliders.getByRole("button", { name: text, exact: true });
        // The typed field is a draft until it loses focus.
        await batches.fill("2");
        await batches.blur();
        await expect.soft(pick("2")).toHaveAttribute("aria-pressed", "true");
        await shot(one, "04b-plan-sliders-2");
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

        await one.getByRole("button", { name: "Looks right" }).click();
        await expect(one).toHaveURL(/\/list$/);
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

        // 5 tbsp on hand plus the 17 bought.
        await one.goto("/pantry");
        await expect
          .soft(pantryRow(one, "unsalted butter").getByRole("button").first())
          .toHaveText(/unsalted butter\s*22 tbsp/);
        await one.getByLabel("Find in the pantry").fill("butter");
        await shot(one, "05c-pantry-butter-22");
      });

      await test.step("06 Made it takes from the pantry and fills the leftovers", async () => {
        await one.goto("/week");
        await one
          .locator("main li")
          .filter({ hasText: SLIDERS })
          .getByRole("button", { name: "Made it", exact: true })
          .click();
        const sheet = one.getByRole("dialog");
        await expect
          .soft(sheet.getByRole("button", { name: "1", exact: true }))
          .toHaveAttribute("aria-pressed", "true");
        await expect(sheet.getByRole("list", { name: "Ingredients used" })).toBeVisible();
        await shot(one, "06a-made-it-sheet");
        await sheet.getByRole("button", { name: "Made it", exact: true }).click();
        await expect
          .soft(one.getByText(new RegExp(`^Made ${SLIDERS}\\. 12 sliders in the`)))
          .toBeVisible();
        await shot(one, "06b-made-it-summary");
        await sheet.getByRole("button", { name: "Done" }).click();

        await one.goto("/pantry");
        for (const name of ["Hawaiian rolls", "sliced ham"]) {
          await expect
            .soft(pantryRow(one, name).getByRole("button").first())
            .toHaveText(new RegExp(`${name}\\s*Out`));
        }
        await expect
          .soft(pantryRow(one, "Italian seasoning").getByRole("button", { name: "Half" }))
          .toHaveAttribute("aria-pressed", "true");
        // 22 after shopping, less the 2 tbsp the sliders used.
        await expect
          .soft(pantryRow(one, "unsalted butter").getByRole("button").first())
          .toHaveText(/unsalted butter\s*20 tbsp/);
        await shot(one, "06c-pantry-after-cook");

        await one.goto("/leftovers");
        const sliders = leftoverCard(one, SLIDERS);
        await expect.soft(sliders).toContainText("12 sliders");
        await sliders.getByRole("button", { name: "Ate one" }).click();
        await expect.soft(sliders).toContainText("11 sliders");
        await shot(one, "06d-leftovers-11");
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
        await expect(one).toHaveURL(/\/week$/);
        await expect.soft(one.getByText("Week closed. A new one is ready to plan.")).toBeVisible();
        await expect.soft(one.getByText("Planning", { exact: true })).toBeVisible();
        await expect.soft(one.getByText("No recipes picked yet.")).toBeVisible();
        await shot(one, "07b-new-week");

        await one.goto("/leftovers");
        await expect.soft(one.getByText(/^Nothing left over\./)).toBeVisible();

        await one.goto("/settings");
        await one.getByRole("button", { name: "Recent changes" }).click();
        const drawer = one.getByRole("dialog");
        // Exact, so the "Undone: Closed out ..." line the undo adds is not this row.
        const closed = drawer
          .locator("li")
          .filter({ has: one.getByText(`Closed out ${SLIDERS}: eaten`, { exact: true }) });
        await expect(closed.getByRole("button", { name: "Undo" })).toBeVisible();
        await shot(one, "07c-undo-drawer");
        await closed.getByRole("button", { name: "Undo" }).click();
        // The row can no longer be undone, and says why.
        await expect.soft(closed.getByRole("button", { name: "Undo" })).toHaveCount(0);
        await expect.soft(closed).toContainText("Undone.");
        await shot(one, "07d-closeout-undone");

        await one.goto("/leftovers");
        await expect.soft(leftoverCard(one, SLIDERS)).toContainText("11 sliders");
        await shot(one, "07e-leftovers-back");
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
    }
  });
});
