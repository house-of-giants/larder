import { Check, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "#/lib/utils";
import { Amount } from "./amount";

/**
 * The row the store list, the pantry, reconcile and the sheet share (DESIGN.md, List row):
 * a 22px circle, the name, and under it the amount in tomato with the recipe it is for.
 * The whole row is the tap target. Checked, the circle fills and the words go quiet where
 * they stand; put back (on hand or skipped), the ring is dashed with a plus.
 */
export function ListRow({
  checked,
  putBack = false,
  name,
  amount,
  for: forRecipe,
  onToggle,
  trailing,
}: {
  checked: boolean;
  putBack?: boolean;
  name: string;
  amount: { quantityText: string; unit: string };
  for: string | null;
  onToggle: () => void;
  trailing?: ReactNode;
}) {
  const quiet = checked || putBack;
  return (
    <li className="flex items-stretch border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        {...(putBack ? {} : { role: "checkbox", "aria-checked": checked })}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-md py-1.5 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : putBack
                ? "border-dashed border-ring-quiet text-muted-foreground"
                : "border-ring-quiet",
          )}
        >
          {checked && <Check className="size-3.5" strokeWidth={3} />}
          {putBack && <Plus className="size-3.5" strokeWidth={2.5} />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          {putBack && <span className="sr-only">Put back on the list: </span>}
          <span
            className={cn(
              "truncate text-body transition-colors duration-[120ms]",
              quiet && "text-muted-foreground",
            )}
          >
            {name}
          </span>
          <span className="mt-0.5 truncate text-caption">
            <Amount quantityText={amount.quantityText} unit={amount.unit} quiet={quiet} />
            {forRecipe && <i className="text-muted-foreground"> for {forRecipe}</i>}
          </span>
        </span>
      </button>
      {trailing}
    </li>
  );
}
