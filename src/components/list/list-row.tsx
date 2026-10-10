import { Check, EllipsisVertical, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { cn } from "#/lib/utils";
import type { ListItem } from "./types";

/** What to buy, in the list's own words: the purchase amount, or what the recipes need. */
function amount(item: ListItem) {
  return item.purchase ?? item.required;
}

/**
 * One thing to get. The whole row is the tap target: a tap checks it, and a checked,
 * skipped, or already-here row goes back on the list. Needed rows carry a small menu
 * with Skip.
 */
export function ListRow({
  item,
  onToggle,
  onSkip,
}: {
  item: ListItem;
  onToggle: () => void;
  onSkip?: () => void;
}) {
  const checked = item.status === "checked";
  const putBack = item.status === "onHand" || item.status === "skipped";
  const details = [item.purchase?.note, item.source === "adhoc" ? "added" : undefined].filter(
    Boolean,
  );

  return (
    <li
      data-testid="list-row"
      data-item-id={item._id}
      data-status={item.status}
      className="flex items-stretch"
    >
      <button
        type="button"
        onClick={onToggle}
        {...(putBack ? {} : { role: "checkbox", "aria-checked": checked })}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pr-3 pl-3 text-left outline-none transition-colors duration-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset active:bg-accent/60"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md border-2",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : putBack
                ? "border-dashed border-muted-foreground/50 text-muted-foreground"
                : "border-muted-foreground",
          )}
        >
          {checked && <Check className="size-5" strokeWidth={3} />}
          {putBack && <Plus className="size-4" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {putBack && <span className="sr-only">Put back on the list: </span>}
          <span
            className={cn(
              "line-clamp-2 text-base [overflow-wrap:anywhere]",
              (checked || putBack) && "text-muted-foreground",
              checked && "line-through",
            )}
          >
            {item.displayName}
          </span>
          {details.length > 0 && (
            <span className="truncate text-sm text-muted-foreground">{details.join(" · ")}</span>
          )}
        </span>
        <span
          className={cn(
            "shrink-0 text-base whitespace-nowrap",
            (checked || putBack) && "text-muted-foreground",
          )}
        >
          <span className="tabular">{amount(item).quantityText}</span> {amount(item).unit}
        </span>
      </button>
      {onSkip && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`More for ${item.displayName}`}
            className="flex w-12 shrink-0 items-center justify-center text-muted-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset"
          >
            <EllipsisVertical aria-hidden className="size-5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="min-h-11 px-3 text-base" onSelect={onSkip}>
              Skip
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}
