import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Background token (oklch 0.97 0.008 85), the same color as the theme-color meta.
const paper = "#f6f3ec";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // Tests beside the screens in src/routes are not routes.
    tanstackStart({ router: { routeFileIgnorePattern: "\\.test\\.tsx?$" } }),
    // Packages the Start server for the deploy target: Vercel Functions on Vercel, a node server everywhere else.
    nitro(),
    viteReact(),
    // Installable app and offline store mode. Its build step (manifest file, service
    // worker) runs in the client environment only: those files belong next to the client
    // assets, not in the server bundle. `virtual:pwa-register` resolves everywhere.
    ...VitePWA({
      registerType: "autoUpdate",
      // Registered from src/offline/register-sw.ts, client only.
      injectRegister: false,
      integration: {
        // The client environment's output (.output/public under Node, the static dir on
        // Vercel), not the top-level build.outDir, which no environment writes to.
        configureOptions(config, options) {
          options.outDir = config.environments.client.build.outDir;
        },
      },
      manifest: {
        name: "Larder",
        short_name: "Larder",
        description: "The week's cooking, the pantry, and the list.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        theme_color: paper,
        background_color: paper,
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // The app shell: every built client asset. Pages are rendered by the server, so
        // there is no static index.html to fall back to; see runtimeCaching instead.
        globPatterns: ["**/*.{js,css,svg,png,webmanifest}"],
        navigateFallback: null,
        runtimeCaching: [
          {
            // Each app page as last served, so a page opened once opens again with no
            // signal. Sign-in, the MCP door, and APIs always go to the network.
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" &&
              !/^\/(mcp|sign-in|sign-up|api)(\/|$)/.test(url.pathname),
            handler: "NetworkFirst",
            options: {
              cacheName: "pages",
              networkTimeoutSeconds: 4,
              // Only real pages: never a redirect (status 0) or an error.
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 16 },
            },
          },
        ],
      },
    }).map((plugin) =>
      plugin.name === "vite-plugin-pwa:build"
        ? {
            ...plugin,
            applyToEnvironment: (environment: { name: string }) => environment.name === "client",
          }
        : plugin,
    ),
  ],
  server: { port: 3000 },
});
