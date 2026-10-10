import { Plus } from "lucide-react";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "#/lib/utils";

/**
 * The floating add button: a 56px tomato circle with a plus, 16px from the right edge and
 * 16px above the tab bar. `label` is its accessible name. With `asChild`, the child (a
 * Link) becomes the button and the plus goes inside it.
 */
export function Fab({
  label,
  asChild = false,
  className,
  children,
  ...props
}: ComponentProps<"button"> & { label: string; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      aria-label={label}
      className={cn(
        "fixed right-4 bottom-[calc(4rem+1rem+env(safe-area-inset-bottom))] z-20 flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-fab outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:brightness-95",
        className,
      )}
      {...(asChild ? {} : { type: "button" as const })}
      {...props}
    >
      <Plus aria-hidden className="size-[26px]" strokeWidth={2.4} />
      <Slot.Slottable>{children}</Slot.Slottable>
    </Comp>
  );
}
