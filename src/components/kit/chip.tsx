import type { ComponentProps } from "react";
import { cn } from "#/lib/utils";

/**
 * A filter chip: card fill and hairline at rest, tomato pale with tomato ink when
 * selected. 8px corners; the padding keeps the tap target at 40px.
 */
export function Chip({
  selected = false,
  className,
  ...props
}: ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center rounded-sm border px-2.5 py-1.5 text-caption whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        selected
          ? "border-transparent bg-accent font-semibold text-accent-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
