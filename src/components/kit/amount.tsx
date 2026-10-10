import { shownUnit } from "#/components/recipes/recipe-text";
import { amountTone } from "#/lib/amount";
import { cn } from "#/lib/utils";

/**
 * An amount in the recipe's own words: the figure in tomato at 600 with tabular figures,
 * the unit plain. Words with no figure ("as needed"), or a row that is done, stay quiet.
 */
export function Amount({
  quantityText,
  unit,
  quiet = false,
  className,
}: {
  quantityText: string;
  unit: string;
  quiet?: boolean;
  className?: string;
}) {
  const tone = quiet ? "quiet" : amountTone(quantityText);
  const shown = shownUnit(unit);
  return (
    <span className={cn(tone === "quiet" && "text-muted-foreground", className)}>
      <span
        data-tone={tone}
        className={cn("tabular", tone === "accent" && "font-semibold text-primary")}
      >
        {quantityText}
      </span>
      {shown && ` ${shown}`}
    </span>
  );
}
