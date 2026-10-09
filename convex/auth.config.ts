// Clerk issues the identity tokens Convex verifies. The JWT template in Clerk must be
// named "convex" and the issuer domain is set on each deployment:
//   bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<instance>.clerk.accounts.dev
// The Convex CLI refuses to push while the variable is unset, so a placeholder domain
// stands in until the Clerk application exists; no token verifies against it.
const clerkDomain = process.env.CLERK_JWT_ISSUER_DOMAIN;

if (!clerkDomain) {
  throw new Error("Missing CLERK_JWT_ISSUER_DOMAIN environment variable");
}

export default {
  providers: [{ domain: clerkDomain, applicationID: "convex" }],
};
