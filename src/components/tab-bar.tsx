import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { FileRouteTypes } from "#/routeTree.gen";

export type Tab = {
  to: FileRouteTypes["to"];
  label: string;
  icon: LucideIcon;
};

/** Bottom navigation, one thumb's reach. Later phases add tabs by extending the list. */
export function TabBar({ tabs }: { tabs: readonly Tab[] }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-2xl">
        {tabs.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground"
              activeProps={{ className: "text-primary", "aria-current": "page" }}
            >
              <Icon aria-hidden className="size-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
