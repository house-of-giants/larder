import { SignIn } from "@clerk/tanstack-react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useCleanAuthUrl } from "#/hooks/use-clean-auth-url";
import { authUrl, localPath, redirectParam } from "#/lib/redirect";

type AuthSearch = { redirect_url?: string };

export const Route = createFileRoute("/sign-in/$")({
  // A local path or a full URL survives here; the screen keeps it only when it is on this
  // origin (Clerk passes the return address between its cards as a full URL). See
  // src/lib/redirect.ts. The key is always returned: leaving it out would let the raw
  // value through in the merged search.
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    redirect_url: redirectParam(search.redirect_url),
  }),
  component: SignInRoute,
});

function SignInRoute() {
  // The server render has no origin, so only a plain path counts there; Clerk's card mounts
  // in the browser, where a URL on this origin counts too.
  const origin = typeof window === "undefined" ? undefined : window.location.origin;
  const returnTo = localPath(Route.useSearch().redirect_url, origin);
  // Clerk reads redirect parameters from the address bar itself; the card waits until
  // only the ones the app honors are left.
  const clean = useCleanAuthUrl();
  return (
    <main data-screen="sign-in" className="flex min-h-dvh items-center justify-center px-4 py-10">
      {clean && (
        <SignIn
          signUpUrl={authUrl("/sign-up", returnTo)}
          forceRedirectUrl={returnTo}
          signUpForceRedirectUrl={returnTo}
          fallbackRedirectUrl="/"
        />
      )}
    </main>
  );
}
