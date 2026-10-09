import { SignIn } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { authUrl, localPath } from "#/lib/redirect";

type AuthSearch = { redirect_url?: string };

export const Route = createFileRoute("/sign-in/$")({
  // Only a path on this site survives; see src/lib/redirect.ts. The key is always
  // returned: leaving it out would let the raw value through in the merged search.
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    redirect_url: localPath(search.redirect_url),
  }),
  component: SignInRoute,
});

function SignInRoute() {
  const returnTo = localPath(Route.useSearch().redirect_url);
  return (
    <main data-screen="sign-in" className="flex min-h-dvh items-center justify-center px-4 py-10">
      <SignIn
        signUpUrl={authUrl("/sign-up", returnTo)}
        forceRedirectUrl={returnTo}
        signUpForceRedirectUrl={returnTo}
        fallbackRedirectUrl="/"
      />
    </main>
  );
}
