import { ChevronRight } from "lucide-react";
import { cn } from "#/lib/utils";

/**
 * A store section over its rows: the name in the serif, "N to get" in quiet caption on the
 * right. Sticky, it sits under the app header (48px, its hairline, and the top inset) and
 * under the tab bar. Collapsed, a chevron replaces the count.
 */
export function AisleHeading({
  title,
  count,
  countLabel = "to get",
  collapsed = false,
  sticky = false,
  className,
}: {
  title: string;
  count: number;
  countLabel?: string;
  collapsed?: boolean;
  sticky?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3 bg-background pt-4 pb-1",
        sticky && "sticky top-[calc(3rem+1px+env(safe-area-inset-top))] z-10",
        className,
      )}
    >
      <h2 className="min-w-0 font-display text-title text-foreground">{title}</h2>
      {collapsed ? (
        <ChevronRight
          aria-hidden
          className="size-[18px] shrink-0 self-center text-muted-foreground"
        />
      ) : (
        <span className="shrink-0 text-caption text-muted-foreground">
          <span className="tabular">{count}</span> {countLabel}
        </span>
      )}
    </div>
  );
}
