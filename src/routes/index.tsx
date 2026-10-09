import { Navigate, createFileRoute } from "@tanstack/react-router";
import { PageSkeleton } from "#/components/page-skeleton";
import { useHousehold } from "#/hooks/use-household";
import { requireSignedIn, returnTo } from "#/lib/auth-gate";
import { isOffline, useOnline } from "#/offline/use-online";

// The front door: sign-in is checked on the server, the household on the client.
export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) =>
    isOffline() ? undefined : requireSignedIn({ data: returnTo(location) }),
  component: Home,
});

function Home() {
  const household = useHousehold();
  const online = useOnline();

  // Opened from the home screen with no signal: the household cannot load, and the list
  // saved on this phone is what is useful.
  if (household === undefined) {
    return online ? <PageSkeleton /> : <Navigate to="/list" replace />;
  }
  if (household === null) {
    return <Navigate to="/join" replace />;
  }
  return <Navigate to="/week" replace />;
}
