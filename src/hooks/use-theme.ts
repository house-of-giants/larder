import { useSyncExternalStore } from "react";
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

function apply() {
  applyStoredTheme(THEME_KEY, themeColors);
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key === THEME_KEY || event.key === null) apply();
}

function subscribe(listener: () => void) {
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

function readPreference(): ThemePreference {
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
  } catch {
    // Storage blocked: nothing to keep, so the phone's setting stays in charge.
  }
  apply();
}

/** What the person picked: System, Light, or Dark. The server render assumes System. */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, readPreference, () => "system");
}

/** The theme on screen right now. The server render assumes light. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, readTheme, () => "light");
}
