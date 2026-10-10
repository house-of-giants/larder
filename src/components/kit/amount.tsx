import { shownUnit } from "#/components/recipes/recipe-text";
import { amountTone } from "#/lib/amount";
import { pluralUnit } from "#/lib/units";
import { cn } from "#/lib/utils";

/**
 * An amount in the recipe's own words (DESIGN.md, the Amount Rule): figure and unit in
 * tomato at 600, tabular figures on the numeral only. Words with no figure ("as needed"),
 * or a row that is done, stay quiet ink at regular weight. Units read as the cook says them
 * ("2 sprigs"; DESIGN.md, the Plural Rule).
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
  const shown = pluralUnit(quantityText, shownUnit(unit));
  // Only text that parses as a number is a figure; "as needed" stays plain words.
  const figure = amountTone(quantityText) === "accent";
  return (
    <span
      data-tone={tone}
      className={cn(
        tone === "accent" ? "font-semibold text-primary" : "text-muted-foreground",
        className,
      )}
    >
      {figure ? <span className="tabular">{quantityText}</span> : quantityText}
      {shown && ` ${shown}`}
    </span>
  );
}
