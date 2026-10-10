import { useEffect, useSyncExternalStore } from "react";
import {
  DARK_QUERY,
  THEME_KEY,
  applyStoredTheme,
  parsePreference,
  themeColors,
  type Theme,
  type ThemePreference,
} from "#/lib/theme";

// The head script (src/lib/theme.ts) applies the choice before first paint; this keeps it
// applied afterwards: on a new choice, when the phone flips while on System, and when
// another tab changes it.
const listeners = new Set<() => void>();

// Set only when storage refused a write: the choice then lives here until the page closes,
// rather than falling back to System.
let sessionChoice: ThemePreference | null = null;

function apply() {
  applyStoredTheme(THEME_KEY, themeColors, sessionChoice ?? undefined);
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key === THEME_KEY || event.key === null) apply();
}

export function subscribeTheme(listener: () => void) {
  if (listeners.size === 0) {
    matchMedia(DARK_QUERY).addEventListener("change", apply);
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      matchMedia(DARK_QUERY).removeEventListener("change", apply);
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function currentPreference(): ThemePreference {
  if (sessionChoice !== null) return sessionChoice;
  try {
    return parsePreference(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

function readTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Saves the choice on this phone and applies it now. System clears it. */
export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
    sessionChoice = null;
  } catch {
    // Storage blocked: keep the choice for this session; the next visit starts at System.
    sessionChoice = preference;
  }
  apply();
}

/**
 * Keeps the theme applied for as long as the page is open. Called once, from the shell.
 * Marks `<html data-theme-ready="1">` once it listens: the page is hydrated and follows the
 * phone from then on (the e2e theme suite waits on it).
 */
export function useThemeSync(): void {
  useEffect(() => {
    const unsubscribe = subscribeTheme(() => {});
    document.documentElement.dataset.themeReady = "1";
    return () => {
      delete document.documentElement.dataset.themeReady;
      unsubscribe();
    };
  }, []);
}

/** What the person picked: System, Light, or Dark. The server render assumes System. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeTheme, currentPreference, () => "system");
}

/** The theme on screen right now. The server render assumes light. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeTheme, readTheme, () => "light");
}
