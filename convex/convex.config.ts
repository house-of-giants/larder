import { defineApp } from "convex/server";
import { v } from "convex/values";

// Deployment environment variables, read through the typed `env` from _generated/server.
// A required one that is missing fails the push instead of the first request.
const app = defineApp({
  env: {
    // Clerk's issuer for identity tokens (see auth.config.ts).
    CLERK_JWT_ISSUER_DOMAIN: v.string(),
    // "true" on the dev deployment only. seed.load and the testing helpers refuse to run
    // anywhere else, so a stray `--prod` cannot wipe a household's kitchen.
    SEED_ALLOWED: v.optional(v.string()),
  },
});

export default app;
