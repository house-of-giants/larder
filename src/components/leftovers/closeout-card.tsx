import { cn } from "#/lib/utils";
import { RemainingWords } from "./leftover-card";
import type { Leftover } from "./types";

export type Outcome = "eaten" | "keep" | "tossed";

const outcomes: { value: Outcome; label: string }[] = [
  { value: "eaten", label: "All eaten" },
  { value: "keep", label: "Some left" },
  { value: "tossed", label: "Tossed" },
];

/**
 * One leftover at closeout, as a row: the name, how much is left and where, then its
 * three-way say as chips (radios underneath, so arrow keys move between them). All eaten
 * unless someone says otherwise.
 */
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
    <li className="flex flex-col border-b border-border py-3 last:border-b-0">
      <h2 className="text-body font-normal">{food.name}</h2>
      <p className="mt-0.5 text-caption text-muted-foreground">
        <span className="font-semibold text-primary">
          <RemainingWords food={food} />
        </span>{" "}
        left · {food.location}
      </p>
      <fieldset className="m-0 mt-1 flex min-w-0 gap-2 border-0 p-0">
        <legend className="sr-only">What happened to {food.name}</legend>
        {outcomes.map((o) => {
          const on = outcome === o.value;
          return (
            <label key={o.value} className="group flex min-h-11 cursor-pointer items-center">
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={on}
                onChange={() => onChange(o.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "rounded-sm border px-2.5 py-1.5 text-caption whitespace-nowrap",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-focus-visible:outline-solid",
                  on
                    ? "border-transparent bg-accent font-semibold text-accent-foreground"
                    : "border-border bg-card text-muted-foreground group-hover:text-foreground",
                )}
              >
                {o.label}
              </span>
            </label>
          );
        })}
      </fieldset>
      {outcome === "keep" && (
        <p className="text-caption text-muted-foreground">
          Stays in the {food.location} for next week.
        </p>
      )}
    </li>
  );
}
