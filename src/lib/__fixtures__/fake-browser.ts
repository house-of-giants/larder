import { THEME_KEY } from "#/lib/theme";

type Meta = {
  attributes: Map<string, string>;
  setAttribute: (name: string, value: string) => void;
};

/**
 * Just enough of a browser for the theme code: storage (which can be made to throw), the
 * color-scheme media query (which can flip), <html>'s classes, and the <head> metas.
 */
export function fakeBrowser({ stored, systemDark }: { stored?: string; systemDark: boolean }) {
  const classes = new Set<string>();
  const metas: Meta[] = [];
  const storage = new Map<string, string>(stored === undefined ? [] : [[THEME_KEY, stored]]);
  const mediaListeners = new Set<() => void>();
  const state = { systemDark, storageThrows: false };
  const guard = () => {
    if (state.storageThrows) throw new Error("SecurityError");
  };

  const makeMeta = (): Meta => {
    const attributes = new Map<string, string>();
    return { attributes, setAttribute: (name, value) => void attributes.set(name, value) };
  };

  return {
    state,
    classes,
    /** The content of every `meta[name="theme-color"]` in <head>, in order. */
    themeColors: () =>
      metas
        .filter((m) => m.attributes.get("name") === "theme-color")
        .map((m) => m.attributes.get("content")),
    /** The phone switches between light and dark. */
    flipSystem(dark: boolean) {
      state.systemDark = dark;
      for (const listener of mediaListeners) listener();
    },
    localStorage: {
      getItem: (key: string) => (guard(), storage.get(key) ?? null),
      setItem: (key: string, value: string) => (guard(), void storage.set(key, value)),
      removeItem: (key: string) => (guard(), void storage.delete(key)),
    },
    matchMedia: (query: string) => ({
      matches: query === "(prefers-color-scheme: dark)" && state.systemDark,
      addEventListener: (_: string, listener: () => void) => void mediaListeners.add(listener),
      removeEventListener: (_: string, listener: () => void) =>
        void mediaListeners.delete(listener),
    }),
    window: { addEventListener: () => {}, removeEventListener: () => {} },
    document: {
      documentElement: {
        classList: {
          contains: (name: string) => classes.has(name),
          toggle: (name: string, on: boolean) => {
            if (on) classes.add(name);
            else classes.delete(name);
          },
        },
      },
      head: { appendChild: (meta: Meta) => void metas.push(meta) },
      createElement: () => makeMeta(),
      querySelector: (selector: string) =>
        selector === 'meta[name="theme-color"]'
          ? (metas.find((m) => m.attributes.get("name") === "theme-color") ?? null)
          : null,
    },
  };
}

export type FakeBrowser = ReturnType<typeof fakeBrowser>;
