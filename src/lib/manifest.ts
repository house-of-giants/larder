import type { ManifestOptions } from "vite-plugin-pwa";
import { themeColors } from "#/lib/theme";

/** The installed app: what the home screen, the splash, and the long-press menu show. */
export const manifest: Partial<ManifestOptions> = {
  // Installs made while start_url was "/" were identified by it; keep them the same app.
  id: "/",
  name: "Larder",
  short_name: "Larder",
  description: "The week's cooking, the pantry, and the list.",
  // A member's first screen; "/" only redirects there.
  start_url: "/week",
  scope: "/",
  display: "standalone",
  categories: ["food", "productivity"],
  theme_color: themeColors.light,
  background_color: themeColors.light,
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    {
      src: "/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
  // Long-press on the home-screen icon (Android).
  shortcuts: [
    { name: "Store", short_name: "Store", url: "/list" },
    { name: "Pantry", short_name: "Pantry", url: "/pantry" },
  ],
};
