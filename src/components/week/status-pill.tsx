import { cn } from "#/lib/utils";
import { type WeekStatus, weekStatusLabels } from "./labels";

export function StatusPill({ status }: { status: WeekStatus }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "planning"
          ? "bg-secondary text-secondary-foreground"
          : "bg-primary/10 text-primary",
      )}
    >
      {weekStatusLabels[status]}
    </span>
  );
}
