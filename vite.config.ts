import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    // Tests beside the screens in src/routes are not routes.
    tanstackStart({ router: { routeFileIgnorePattern: "\\.test\\.tsx?$" } }),
    // Packages the Start server for the deploy target: Vercel Functions on Vercel, a node server everywhere else.
    nitro(),
    viteReact(),
  ],
  server: { port: 3000 },
});
