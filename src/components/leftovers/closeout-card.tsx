import { RadioChips } from "#/components/kit/radio-chips";
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
  return (
    <li className="flex flex-col border-b border-border py-3 last:border-b-0">
      <h2 className="text-body font-normal">{food.name}</h2>
      <p className="mt-0.5 text-caption text-muted-foreground">
        <span className="font-semibold text-primary">
          <RemainingWords food={food} />
        </span>{" "}
        left · {food.location}
      </p>
      <RadioChips
        name={`closeout-${food._id}`}
        legend={`What happened to ${food.name}`}
        options={outcomes}
        value={outcome}
        onChange={onChange}
        className="mt-1"
      />
      {outcome === "keep" && (
        <p className="text-caption text-muted-foreground">
          Stays in the {food.location} for next week.
        </p>
      )}
    </li>
  );
}
