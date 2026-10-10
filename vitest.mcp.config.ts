import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// The MCP integration test (`bun run test:mcp`): it talks to the dev deployment, so it is
// kept out of `bun run test` and reads .env.local for VITE_CONVEX_URL and AGENT_SECRET.
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "#": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/mcp/**/*.test.ts"],
    environment: "node",
    env: loadEnv(mode, process.cwd(), ""),
    // `bunx convex run` and real round trips to the deployment.
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
}));
