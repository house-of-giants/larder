import { amountWords } from "#/lib/amounts";
import { cn } from "#/lib/utils";
import { type Leftover, placeLabels } from "./types";

export type Outcome = "eaten" | "keep" | "tossed";

const outcomes: { value: Outcome; label: string }[] = [
  { value: "eaten", label: "All eaten" },
  { value: "keep", label: "Some left" },
  { value: "tossed", label: "Tossed" },
];

/** One leftover at closeout, with its three-way say. All eaten unless someone says otherwise. */
export function CloseoutCard({
  food,
  outcome,
  onChange,
}: {
  food: Leftover;
  outcome: Outcome;
  onChange: (outcome: Outcome) => void;
}) {
  const name = `closeout-${food._id}`;
  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 font-medium">{food.name}</h2>
        <span className="num shrink-0 text-sm text-muted-foreground">
          {amountWords(food.remaining.text, food.remaining.decimal, food.unit)},{" "}
          {placeLabels[food.location].toLowerCase()}
        </span>
      </div>
      <fieldset className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        <legend className="sr-only">What happened to {food.name}</legend>
        {outcomes.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-11 cursor-pointer items-center justify-center rounded-md px-2 text-center text-sm has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50",
              outcome === o.value
                ? "bg-background font-medium text-foreground shadow-xs"
                : "text-muted-foreground",
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={outcome === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.label}
          </label>
        ))}
      </fieldset>
      {outcome === "keep" && (
        <p className="text-sm text-muted-foreground">Stays in the {food.location} for next week.</p>
      )}
    </li>
  );
}
