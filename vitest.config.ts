import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone so tests do not load the TanStack Start / Nitro plugin stack from vite.config.ts.
// Inline projects inherit this root config (the `#` alias).
export default defineConfig({
  resolve: {
    alias: {
      "#": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "lib",
          include: ["src/**/*.test.{ts,tsx}"],
          environment: "node",
        },
      },
      {
        // The Convex runtime is not Node: no fs, no Buffer, no node: modules. edge-runtime is
        // what convex-test runs under, so a function that leans on Node fails here, not on push.
        test: {
          name: "convex",
          include: ["convex/**/*.test.ts"],
          environment: "edge-runtime",
          server: { deps: { inline: ["convex-test"] } },
          // vi.stubEnv (the seed guard's SEED_ALLOWED) resets between tests.
          unstubEnvs: true,
          // edge-runtime copies every global, and touching Node's localStorage without a
          // backing file prints a warning per worker. Convex has no Web Storage either.
          execArgv: ["--no-experimental-webstorage"],
        },
      },
    ],
  },
});
