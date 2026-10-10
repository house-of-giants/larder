import { describe, expect, it } from "vitest";
import { isStandalone } from "#/lib/standalone";

const media = (standalone: boolean) => (query: string) => ({
  matches: query === "(display-mode: standalone)" && standalone,
});

describe("isStandalone", () => {
  it("is true when opened from the home screen on Android or desktop", () => {
    expect(isStandalone({ matchMedia: media(true), navigator: {} })).toBe(true);
  });

  it("is true for an iOS home-screen app, which reports it on navigator", () => {
    expect(isStandalone({ matchMedia: media(false), navigator: { standalone: true } })).toBe(true);
  });

  it("is false in a browser tab", () => {
    expect(isStandalone({ matchMedia: media(false), navigator: {} })).toBe(false);
    expect(isStandalone({ matchMedia: media(false), navigator: { standalone: false } })).toBe(
      false,
    );
  });
});
