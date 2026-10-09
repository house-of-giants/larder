import { SignUp } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { authUrl, localPath } from "#/lib/redirect";

type AuthSearch = { redirect_url?: string };

export const Route = createFileRoute("/sign-up/$")({
  // Only a path on this site survives; see src/lib/redirect.ts. The key is always
  // returned: leaving it out would let the raw value through in the merged search.
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    redirect_url: localPath(search.redirect_url),
  }),
  component: SignUpRoute,
});

function SignUpRoute() {
  const returnTo = localPath(Route.useSearch().redirect_url);
  return (
    <main data-screen="sign-up" className="flex min-h-dvh items-center justify-center px-4 py-10">
      <SignUp
        signInUrl={authUrl("/sign-in", returnTo)}
        forceRedirectUrl={returnTo}
        signInForceRedirectUrl={returnTo}
        fallbackRedirectUrl="/"
      />
    </main>
  );
}
