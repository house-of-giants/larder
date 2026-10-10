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
 * One navigation entry, icon then label. The router marks the open screen; a preview (the
 * gallery) passes `current` instead and gets a plain link, so exactly one entry is ever
 * current. Shared by the tab bar and the desktop rail.
 */
export function NavEntry({
  tab: { to, label, icon: Icon },
  current,
  className,
  iconClassName,
}: {
  tab: Tab;
  current?: Tab["to"];
  className: string;
  iconClassName: string;
}) {
  const inner = (
    <>
      <Icon aria-hidden className={iconClassName} strokeWidth={1.8} />
      {label}
    </>
  );
  return current === undefined ? (
    <Link to={to} className={className} activeProps={{ "aria-current": "page" }}>
      {inner}
    </Link>
  ) : (
    // A preview: `current` alone decides, the router has no say.
    <a href={to} className={className} aria-current={current === to ? "page" : undefined}>
      {inner}
    </a>
  );
}

const tabClass =
  "flex h-full flex-col items-center justify-center gap-[3px] text-label text-muted-foreground outline-none focus-ring-inset aria-[current=page]:text-primary";

/**
 * Bottom navigation, one thumb's reach: 64px on paper over the safe-area inset, a hairline
 * on top, quiet ink at rest and tomato for the screen you are on. It sits above sticky
 * headings (z-20 over z-10). At lg the shell hides it and the rail takes over.
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
        {tabs.map((tab) => (
          <li key={tab.to} className="flex-1">
            <NavEntry tab={tab} current={current} className={tabClass} iconClassName="size-6" />
          </li>
        ))}
      </ul>
    </nav>
  );
}
