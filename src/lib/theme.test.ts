import { describe, expect, it } from "vitest";
import {
  THEME_KEY,
  applyStoredTheme,
  parsePreference,
  resolveTheme,
  themeColors,
  themeScript,
} from "#/lib/theme";

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

/** Just enough of a browser for the head script: storage, the media query, <html>, the meta. */
function fakeBrowser({ stored, systemDark }: { stored?: string; systemDark: boolean }) {
  const classes = new Set<string>();
  const meta = { content: themeColors.light };
  const storage = new Map<string, string>(stored === undefined ? [] : [[THEME_KEY, stored]]);
  return {
    classes,
    meta,
    localStorage: { getItem: (key: string) => storage.get(key) ?? null },
    matchMedia: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && systemDark,
    }),
    document: {
      documentElement: {
        classList: {
          toggle: (name: string, on: boolean) => {
            if (on) classes.add(name);
            else classes.delete(name);
          },
        },
      },
      querySelector: (selector: string) =>
        selector === 'meta[name="theme-color"]'
          ? { setAttribute: (_: string, value: string) => (meta.content = value) }
          : null,
    },
  };
}

type FakeBrowser = ReturnType<typeof fakeBrowser>;

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
      expect(browser.meta.content).toBe(dark ? themeColors.dark : themeColors.light);
    });
  }

  it("falls back to the phone when storage throws (private mode)", () => {
    const browser = fakeBrowser({ systemDark: true });
    browser.localStorage.getItem = () => {
      throw new Error("SecurityError");
    };
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

  it("is the same code the app calls at runtime", () => {
    expect(themeScript).toContain(applyStoredTheme.toString());
  });
});
