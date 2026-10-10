import { env } from "../_generated/server";

/**
 * Seed and testing helpers wipe and refill a household's kitchen. They are internal, so no
 * client reaches them, but `convex run --prod` would; they run only where the deployment
 * says SEED_ALLOWED=true, which is set on the dev deployment and nowhere else.
 */
export function requireSeedAllowed() {
  if (env.SEED_ALLOWED !== "true") {
    throw new Error(
      "Seeding is off on this deployment. It runs only where SEED_ALLOWED is true (dev).",
    );
  }
}
