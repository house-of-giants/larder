import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { manifest } from "./src/lib/manifest.ts";

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
      manifest,
      workbox: {
        // The app shell: every built client asset, precached.
        globPatterns: ["**/*.{js,css,svg,png,webmanifest}"],
        // No neutral shell to fall back to (v1 tradeoff). Every page is server-rendered
        // through the root route, which carries the signed-in user's Clerk SSR state, so
        // there is no user-free HTML to precache at build time; making one would mean a
        // second document route outside ClerkProvider and the root loader, plus a
        // prerender step. Instead each app page is kept as last served for the signed-in
        // user and used only when the network fails. src/offline/identity.tsx deletes
        // this cache on sign-out and whenever a different user signs in.
        navigateFallback: null,
        runtimeCaching: [
          {
            // Sign-in, the MCP door, and APIs always go to the network.
            urlPattern: ({ request, url }) =>
              request.mode === "navigate" &&
              !/^\/(mcp|sign-in|sign-up|api)(\/|$)/.test(url.pathname),
            // Network first with no timeout: a slow network still gets the fresh page;
            // the cached copy is served only when the fetch fails (offline).
            handler: "NetworkFirst",
            options: {
              // Must match PAGES_CACHE in src/offline/identity.tsx.
              cacheName: "pages",
              // Only real pages: never a redirect (status 0) or an error.
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 20, maxAgeSeconds: 7 * 24 * 60 * 60 },
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
