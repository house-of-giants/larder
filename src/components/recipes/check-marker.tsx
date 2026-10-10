import { CircleAlert } from "lucide-react";
import { cn } from "#/lib/utils";

/**
 * A recipe or line an agent was unsure about and a person should look over: a quiet
 * caption with a small icon, so it reads as a note and never as a button.
 */
export function CheckMarker({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 text-caption text-muted-foreground", className)}
    >
      <CircleAlert aria-hidden className="size-3.5 shrink-0" strokeWidth={2} />
      Check this one
    </span>
  );
}
