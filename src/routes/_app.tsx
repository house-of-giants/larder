import { Link, Navigate, Outlet, createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useEffect } from "react";
import { api } from "../../convex/_generated/api";
import { BookOpen, CalendarDays, Refrigerator, Settings, ShoppingBasket } from "lucide-react";
import { PageSkeleton } from "#/components/page-skeleton";
import { TabBar, type Tab } from "#/components/tab-bar";
import { Skeleton } from "#/components/ui/skeleton";
import { useHousehold } from "#/hooks/use-household";
import { requireSignedIn, returnTo } from "#/lib/auth-gate";
import { isOffline, useOnline } from "#/offline/use-online";

// Four tabs (DESIGN.md, Navigation). Leftovers opens from the week's fridge line and
// Settings from the gear in the header; both stay routes.
const tabs: readonly Tab[] = [
  { to: "/week", label: "Week", icon: CalendarDays },
  { to: "/list", label: "List", icon: ShoppingBasket },
  { to: "/pantry", label: "Pantry", icon: Refrigerator },
  { to: "/recipes", label: "Recipes", icon: BookOpen },
];

export const Route = createFileRoute("/_app")({
  // With no signal the server gate cannot answer, so a tab tap in the aisle would fail.
  // Skipping it then exposes nothing: Convex still refuses data without a session, and
  // store mode reads the copy saved on this phone.
  beforeLoad: ({ location }) =>
    isOffline() ? undefined : requireSignedIn({ data: returnTo(location) }),
  component: AppShell,
});

function AppShell() {
  const household = useHousehold();
  const online = useOnline();
  const refreshName = useMutation(api.households.refreshName);
  const me = household?.members.find((m) => m.isYou)?._id;

  // Once per visit: a member who joined before the sign-in carried a name picks it up.
  // Nothing to say if it fails; the row keeps the name it had.
  useEffect(() => {
    if (me !== undefined) refreshName({}).catch(() => {});
  }, [me, refreshName]);

  if (household === null) {
    return <Navigate to="/join" replace />;
  }
  // Offline, the household may never arrive (no Clerk, no Convex); the screens show what
  // this phone saved instead of waiting on it. Online, the tabs stay put while it loads.
  const loading = household === undefined && online;

  return (
    // Clears the tab bar: --nav-offset is its 64px, its hairline, and the bottom inset.
    <div className="min-h-dvh pb-(--nav-offset)">
      <header className="sticky top-0 z-30 border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-4 px-4">
          {loading ? (
            <Skeleton className="h-5 w-32" />
          ) : (
            <p className="truncate font-medium">{household?.household.name ?? "Larder"}</p>
          )}
          <Link
            to="/settings"
            aria-label="Settings"
            className="-mr-2.5 flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-ring"
          >
            <Settings aria-hidden className="size-5" />
          </Link>
        </div>
      </header>
      {loading ? <PageSkeleton /> : <Outlet />}
      <TabBar tabs={tabs} />
    </div>
  );
}
