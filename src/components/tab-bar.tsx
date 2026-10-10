import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { cn } from "#/lib/utils";
import type { FileRouteTypes } from "#/routeTree.gen";

export type Tab = {
  to: FileRouteTypes["to"];
  label: string;
  icon: LucideIcon;
};

const tabClass =
  "flex h-full flex-col items-center justify-center gap-[3px] text-label text-muted-foreground outline-none focus-ring-inset aria-[current=page]:text-primary";

/**
 * Bottom navigation, one thumb's reach: 64px on paper over the safe-area inset, a hairline
 * on top, quiet ink at rest and tomato for the screen you are on. It sits above sticky
 * headings (z-20 over z-10). The router marks the open tab; a preview (the gallery)
 * passes `current` instead and gets plain links, so exactly one tab is ever current.
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
        {tabs.map(({ to, label, icon: Icon }) => {
          const inner = (
            <>
              <Icon aria-hidden className="size-6" strokeWidth={1.8} />
              {label}
            </>
          );
          return (
            <li key={to} className="flex-1">
              {current === undefined ? (
                <Link to={to} className={tabClass} activeProps={{ "aria-current": "page" }}>
                  {inner}
                </Link>
              ) : (
                // A preview (the gallery): `current` alone decides, the router has no say.
                <a
                  href={to}
                  className={tabClass}
                  aria-current={current === to ? "page" : undefined}
                >
                  {inner}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
