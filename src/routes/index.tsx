import { Navigate, createFileRoute } from "@tanstack/react-router";
import { PageSkeleton } from "#/components/page-skeleton";
import { useHousehold } from "#/hooks/use-household";
import { requireSignedIn, returnTo } from "#/lib/auth-gate";

// The front door: sign-in is checked on the server, the household on the client.
export const Route = createFileRoute("/")({
  beforeLoad: ({ location }) => requireSignedIn({ data: returnTo(location) }),
  component: Home,
});

function Home() {
  const household = useHousehold();

  if (household === undefined) {
    return <PageSkeleton />;
  }
  if (household === null) {
    return <Navigate to="/join" replace />;
  }
  return <Navigate to="/week" replace />;
}
