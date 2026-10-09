import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createStart } from "@tanstack/react-start";
import { clerkConfigured } from "#/lib/clerk-config";

// Start only adds its CSRF check for server functions when this file does not exist,
// so it is registered here explicitly (per the Clerk TanStack React Start quickstart).
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  // Without Clerk keys the middleware would fail every request; the app then renders
  // its setup screen instead (see src/routes/__root.tsx).
  requestMiddleware: clerkConfigured() ? [csrfMiddleware, clerkMiddleware()] : [csrfMiddleware],
}));
