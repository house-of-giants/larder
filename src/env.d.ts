/// <reference types="vite-plugin-pwa/vanillajs" />

interface ImportMetaEnv {
  /** Convex deployment URL. `bunx convex dev` writes it to .env.local. */
  readonly VITE_CONVEX_URL?: string;
  /** Clerk publishable key for the instance this build talks to. */
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
}
