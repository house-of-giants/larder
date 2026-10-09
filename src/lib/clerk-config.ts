import { createIsomorphicFn } from "@tanstack/react-start";

// Only the server knows whether Clerk keys exist. Client code learns the answer through
// the root route's loader; the client branch here is never the source of truth.
export const clerkConfigured = createIsomorphicFn()
  .client(() => false)
  .server(() => Boolean(process.env.CLERK_SECRET_KEY && process.env.VITE_CLERK_PUBLISHABLE_KEY));
