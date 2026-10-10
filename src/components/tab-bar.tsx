import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "#/lib/utils";
import type { FileRouteTypes } from "#/routeTree.gen";

export type Tab = {
  to: FileRouteTypes["to"];
  label: string;
  icon: LucideIcon;
};

/**
 * Bottom navigation, one thumb's reach: 64px on paper over the safe-area inset, a hairline
 * on top, quiet ink at rest and tomato for the screen you are on. It sits above sticky
 * headings (z-20 over z-10). `current` marks a tab as the open one without the router
 * (the gallery); otherwise the router decides.
 */
export function TabBar({
  tabs,
  current,
  className,
}: {
  tabs: readonly Tab[];
  current?: Tab["to"];
  className?: string;
}) {
  return (
    <nav
      aria-label="Main"
      className={cn(
        "fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <ul className="mx-auto flex h-16 max-w-2xl">
        {tabs.map(({ to, label, icon: Icon }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              className="flex h-full flex-col items-center justify-center gap-[3px] text-label text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset aria-[current=page]:text-primary"
              {...(current === undefined
                ? { activeProps: { "aria-current": "page" as const } }
                : { "aria-current": current === to ? ("page" as const) : undefined })}
            >
              <Icon aria-hidden className="size-6" strokeWidth={1.8} />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
