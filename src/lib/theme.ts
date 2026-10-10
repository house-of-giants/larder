/** Where the choice lives on this phone. Per device, like any display setting. */
export const THEME_KEY = "larder:theme";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type Theme = "light" | "dark";

export const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * The page background in each theme (--background in src/styles.css), for the
 * theme-color meta and the manifest. Hex, because not every browser chrome reads oklch.
 */
export const themeColors: Record<Theme, string> = { light: "#f6f3ec", dark: "#080811" };

export function parsePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
  return preference === "system" ? (systemDark ? "dark" : "light") : preference;
}

/**
 * Reads the stored choice and applies it: `.dark` on <html> (which also flips
 * `color-scheme`, see src/styles.css) and the theme-color meta. Its source text is also
 * inlined into <head> as `themeScript`, so it runs before first paint; it must use only
 * its arguments and browser globals.
 */
export function applyStoredTheme(key: string, colors: Record<Theme, string>): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(key);
  } catch {
    // Private mode or blocked storage: follow the phone.
  }
  const dark =
    stored === "dark" || (stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? colors.dark : colors.light);
}

/** The inline head script: the function above, called with the key and colors. */
export const themeScript = `(${applyStoredTheme.toString()})(${JSON.stringify(THEME_KEY)},${JSON.stringify(themeColors)})`;
