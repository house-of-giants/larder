import { Link, Navigate, Outlet, createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Settings } from "lucide-react";
import { PageSkeleton } from "#/components/page-skeleton";
import { TabBar, type Tab } from "#/components/tab-bar";
import { useHousehold } from "#/hooks/use-household";
import { requireSignedIn } from "#/lib/auth-gate";

// Later phases add List, Pantry, Recipes, and Leftovers here.
const tabs: readonly Tab[] = [
  { to: "/week", label: "Week", icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: Settings },
];

export const Route = createFileRoute("/_app")({
  beforeLoad: () => requireSignedIn(),
  component: AppShell,
});

function AppShell() {
  const household = useHousehold();

  if (household === undefined) {
    return <PageSkeleton />;
  }
  if (household === null) {
    return <Navigate to="/join" replace />;
  }

  return (
    <div className="min-h-dvh pb-[calc(3.5rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-10 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between gap-4 px-4">
          <p className="truncate font-medium">{household.household.name}</p>
          <Link
            to="/settings"
            aria-label="Settings"
            className="-mr-2 flex size-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
          >
            <Settings aria-hidden className="size-5" />
          </Link>
        </div>
      </header>
      <Outlet />
      <TabBar tabs={tabs} />
    </div>
  );
}
