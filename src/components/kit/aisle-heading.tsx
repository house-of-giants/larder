import { ChevronRight } from "lucide-react";
import { cn } from "#/lib/utils";

/**
 * A store section over its rows: the name in the serif, "N to get" in quiet caption on the
 * right. Sticky, it sits under the app header (48px, its hairline, and the top inset) and
 * under the tab bar; a screen with more pinned under the header moves it down with a
 * `top-*` class. With `onToggle` the whole heading is a button that folds the rows named by
 * `controls`; collapsed, a chevron replaces the count.
 */
export function AisleHeading({
  id,
  title,
  count,
  countLabel = "to get",
  collapsed = false,
  onToggle,
  controls,
  sticky = false,
  className,
}: {
  id?: string;
  title: string;
  /** Left out, the heading carries the title alone. */
  count?: number;
  countLabel?: string;
  collapsed?: boolean;
  onToggle?: () => void;
  controls?: string;
  sticky?: boolean;
  className?: string;
}) {
  const inner = (
    <>
      <span className="min-w-0 font-display text-title text-foreground">{title}</span>
      {collapsed ? (
        <ChevronRight
          aria-hidden
          className="size-[18px] shrink-0 self-center text-muted-foreground"
        />
      ) : (
        count !== undefined && (
          <span className="shrink-0 text-caption text-muted-foreground">
            <span className="tabular">{count}</span> {countLabel}
          </span>
        )
      )}
    </>
  );
  const row = "flex w-full items-baseline justify-between gap-3 pt-4 pb-1";
  return (
    <div
      className={cn(
        "bg-background",
        sticky && "sticky top-[calc(3rem+1px+env(safe-area-inset-top))] z-10",
        className,
      )}
    >
      <h2 id={id} className="font-normal">
        {onToggle ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-controls={controls}
            className={cn(row, "min-h-11 rounded-sm text-left focus-ring")}
          >
            {inner}
          </button>
        ) : (
          <span className={row}>{inner}</span>
        )}
      </h2>
    </div>
  );
}
