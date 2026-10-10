import type { ReactNode } from "react";
import { cn } from "#/lib/utils";
import { NavEntry, type Tab } from "#/components/tab-bar";

const entryClass =
  "flex h-11 items-center gap-3 rounded-md px-2 text-subhead text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-ring-inset aria-[current=page]:font-semibold aria-[current=page]:text-primary";

/**
 * The desktop navigation (DESIGN.md, Layout): at lg the tab bar leaves and the same four
 * entries move to a 240px rail on the left, with the household name on top in caption and
 * Settings at the foot. Quiet ink at rest, tomato and 600 for the screen you are on. The
 * shell shows it only at lg; the gallery passes `current` and places it in a box.
 */
export function Rail({
  household,
  tabs,
  settings,
  current,
  className,
}: {
  household: ReactNode;
  tabs: readonly Tab[];
  settings: Tab;
  current?: Tab["to"];
  className?: string;
}) {
  return (
    <nav
      aria-label="Sections"
      className={cn(
        "fixed inset-y-0 left-0 z-20 flex w-(--rail-width) flex-col border-r border-border bg-background px-3 pt-[env(safe-area-inset-top)] pb-[calc(1rem+env(safe-area-inset-bottom))]",
        className,
      )}
    >
      {/* The same 48px as the app header, so the name sits on the header's line. */}
      <div className="flex h-12 min-w-0 items-center px-2 text-caption text-muted-foreground">
        {household}
      </div>
      <ul className="mt-3 flex flex-col gap-0.5">
        {tabs.map((tab) => (
          <li key={tab.to}>
            <NavEntry tab={tab} current={current} className={entryClass} iconClassName="size-5" />
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <NavEntry tab={settings} current={current} className={entryClass} iconClassName="size-5" />
      </div>
    </nav>
  );
}
