import { describe, expect, it } from "vitest";
import { fakeBrowser, type FakeBrowser } from "#/lib/__fixtures__/fake-browser";
import { parsePreference, resolveTheme, themeColors, themeScript } from "#/lib/theme";

describe("parsePreference", () => {
  it("keeps light and dark", () => {
    expect(parsePreference("light")).toBe("light");
    expect(parsePreference("dark")).toBe("dark");
  });

  it("reads nothing, garbage, or the word system as system", () => {
    expect(parsePreference(null)).toBe("system");
    expect(parsePreference("purple")).toBe("system");
    expect(parsePreference("system")).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("follows the phone for system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("lets an explicit choice win over the phone", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

// The inline script is the function's own source text, so run that text, not the import:
// it must not lean on anything outside itself.
function runScript(browser: FakeBrowser) {
  new Function("localStorage", "matchMedia", "document", themeScript)(
    browser.localStorage,
    browser.matchMedia,
    browser.document,
  );
}

describe("the head script", () => {
  const cases: { stored?: string; systemDark: boolean; dark: boolean }[] = [
    { stored: undefined, systemDark: true, dark: true },
    { stored: undefined, systemDark: false, dark: false },
    { stored: "light", systemDark: true, dark: false },
    { stored: "dark", systemDark: false, dark: true },
    { stored: "system", systemDark: true, dark: true },
    { stored: "nonsense", systemDark: false, dark: false },
  ];

  for (const { stored, systemDark, dark } of cases) {
    it(`stored ${stored ?? "nothing"}, phone ${systemDark ? "dark" : "light"}: ${dark ? "dark" : "light"}`, () => {
      const browser = fakeBrowser({ stored, systemDark });
      browser.classes.add(dark ? "stale" : "dark");
      runScript(browser);
      expect(browser.classes.has("dark")).toBe(dark);
      expect(browser.themeColors()).toEqual([dark ? themeColors.dark : themeColors.light]);
    });
  }

  it("falls back to the phone when storage throws (private mode)", () => {
    const browser = fakeBrowser({ systemDark: true });
    browser.state.storageThrows = true;
    runScript(browser);
    expect(browser.classes.has("dark")).toBe(true);
  });

  it("agrees with resolveTheme for every stored value and phone setting", () => {
    for (const stored of [undefined, "light", "dark", "system", "x"]) {
      for (const systemDark of [true, false]) {
        const browser = fakeBrowser({ stored, systemDark });
        runScript(browser);
        const expected = resolveTheme(parsePreference(stored ?? null), systemDark);
        expect({ stored, systemDark, dark: browser.classes.has("dark") }).toEqual({
          stored,
          systemDark,
          dark: expected === "dark",
        });
      }
    }
  });

  // The server renders no theme-color tag (React would add a second one when hydrating a
  // tag the script had changed); the script owns exactly one.
  it("makes the one theme-color tag, then keeps reusing it", () => {
    const browser = fakeBrowser({ stored: "dark", systemDark: false });
    runScript(browser);
    expect(browser.themeColors()).toEqual([themeColors.dark]);
    browser.flipSystem(true);
    runScript(browser);
    runScript(browser);
    expect(browser.themeColors()).toEqual([themeColors.dark]);
  });
});
