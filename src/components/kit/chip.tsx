import type { ComponentProps } from "react";
import { cn } from "#/lib/utils";

/**
 * A filter chip (DESIGN.md, Chips): caption text at 6px/10px in an 8px chip, card fill and
 * a hairline at rest, tomato pale with tomato ink when selected. The visible chip is the
 * inner span; the button around it is 44px tall, the tap floor, and draws the focus ring
 * around the chip itself.
 */
export function Chip({
  selected = false,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "group inline-flex min-h-11 shrink-0 items-center outline-none disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          "flex w-full justify-center rounded-sm border px-2.5 py-1.5 text-caption whitespace-nowrap",
          "group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring group-focus-visible:outline-solid",
          selected
            ? "border-transparent bg-accent font-semibold text-accent-foreground"
            : "border-border bg-card text-muted-foreground group-hover:text-foreground",
        )}
      >
        {children}
      </span>
    </button>
  );
}
