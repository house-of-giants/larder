import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Standalone so tests do not load the TanStack Start / Nitro plugin stack from vite.config.ts.
export default defineConfig({
  resolve: {
    alias: {
      "#": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}", "convex/**/*.test.ts"],
    environment: "node",
    // convex-test runs Convex functions in the Edge runtime shape; keep `server` deps inline.
    server: { deps: { inline: ["convex-test"] } },
  },
});
