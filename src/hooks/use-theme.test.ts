import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeBrowser, type FakeBrowser } from "#/lib/__fixtures__/fake-browser";
import { themeColors } from "#/lib/theme";

let browser: FakeBrowser;

beforeEach(() => {
  browser = fakeBrowser({ systemDark: false });
  vi.stubGlobal("localStorage", browser.localStorage);
  vi.stubGlobal("matchMedia", browser.matchMedia);
  vi.stubGlobal("document", browser.document);
  vi.stubGlobal("window", browser.window);
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("setThemePreference", () => {
  it("saves the choice and applies it", async () => {
    const { currentPreference, setThemePreference } = await import("#/hooks/use-theme");
    setThemePreference("dark");
    expect(browser.classes.has("dark")).toBe(true);
    expect(browser.localStorage.getItem("larder:theme")).toBe("dark");
    expect(currentPreference()).toBe("dark");
  });

  it("with storage blocked, still holds the choice for this session", async () => {
    const { currentPreference, setThemePreference, subscribeTheme } =
      await import("#/hooks/use-theme");
    browser.state.storageThrows = true;
    const unsubscribe = subscribeTheme(() => {});

    setThemePreference("dark");
    expect(browser.classes.has("dark")).toBe(true);
    expect(currentPreference()).toBe("dark");

    // The phone flipping (which re-applies) must not drop back to System.
    browser.flipSystem(false);
    expect(browser.classes.has("dark")).toBe(true);
    expect(browser.themeColors()).toEqual([themeColors.dark]);

    setThemePreference("system");
    browser.flipSystem(true);
    expect(currentPreference()).toBe("system");
    expect(browser.classes.has("dark")).toBe(true);
    browser.flipSystem(false);
    expect(browser.classes.has("dark")).toBe(false);
    unsubscribe();
  });
});
