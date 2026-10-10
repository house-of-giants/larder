import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { manifest } from "#/lib/manifest";
import { themeColors } from "#/lib/theme";

const publicDir = fileURLToPath(new URL("../../public/", import.meta.url));
const inScope = (url: string) => url.startsWith(manifest.scope ?? "\0");

describe("web manifest", () => {
  it("opens on the week, inside the app's scope, with a stable id", () => {
    expect(manifest.start_url).toBe("/week");
    expect(manifest.scope).toBe("/");
    // Installs made before start_url moved were identified by "/"; keep them the same app.
    expect(manifest.id).toBe("/");
    expect(inScope(manifest.start_url!)).toBe(true);
  });

  it("has Store and Pantry shortcuts that stay in scope", () => {
    const shortcuts = (manifest.shortcuts ?? []).map(({ name, url }) => ({ name, url }));
    expect(shortcuts).toEqual([
      { name: "Store", url: "/list" },
      { name: "Pantry", url: "/pantry" },
    ]);
    for (const { url } of shortcuts) expect(inScope(url)).toBe(true);
  });

  it("carries plain any-purpose icons at 192 and 512 and a maskable one", () => {
    const icons = manifest.icons ?? [];
    const any = icons.filter((icon) => (icon.purpose ?? "any") === "any").map((i) => i.sizes);
    const maskable = icons.filter((icon) => icon.purpose === "maskable").map((i) => i.sizes);
    expect(any).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(maskable).toEqual(["512x512"]);
  });

  it("points only at icons that exist in public/", () => {
    const srcs = [
      ...(manifest.icons ?? []).map((icon) => icon.src),
      ...(manifest.shortcuts ?? []).flatMap((s) => (s.icons ?? []).map((icon) => icon.src)),
    ];
    expect(srcs.length).toBeGreaterThan(0);
    const missing = srcs.filter((src) => !existsSync(publicDir + src.replace(/^\//, "")));
    expect(missing).toEqual([]);
  });

  it("paints the splash and title bar in the light paper color", () => {
    expect(manifest.theme_color).toBe(themeColors.light);
    expect(manifest.background_color).toBe(themeColors.light);
  });
});
