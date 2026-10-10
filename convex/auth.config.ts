// Clerk issues the identity tokens Convex verifies. The JWT template in Clerk must be
// named "convex" and the issuer domain is set on each deployment:
//   bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<instance>.clerk.accounts.dev
// convex.config.ts declares the variable as required, so a push fails while it is unset; a
// placeholder domain stands in until the Clerk application exists, and no token verifies
// against it.
import type { AuthConfig } from "convex/server";
import { env } from "./_generated/server";

export default {
  providers: [{ domain: env.CLERK_JWT_ISSUER_DOMAIN, applicationID: "convex" }],
} satisfies AuthConfig;
