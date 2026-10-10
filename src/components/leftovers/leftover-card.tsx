import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { Pill } from "#/components/kit/pill";
import { amountWords } from "#/lib/amounts";
import { madeAgoLine } from "#/lib/days-ago";
import { errorMessage } from "#/lib/errors";
import { AteSomeSheet } from "./ate-some-sheet";
import type { Leftover } from "./types";

/**
 * One thing in the fridge or freezer, as a row: the name, when it was made and where, how
 * much is left in tomato, then what to do with it. Ate one is the pale pill; the rest are
 * text actions.
 */
export function LeftoverCard({ food, now }: { food: Leftover; now: number }) {
  const consume = useMutation(api.leftovers.consume);
  const discard = useMutation(api.leftovers.discard);
  const move = useMutation(api.leftovers.move);
  const [ateSome, setAteSome] = useState(false);
  const ateOpener = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const other = food.location === "fridge" ? "freezer" : "fridge";
  const errorId = `leftover-${food._id}-error`;

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex flex-col border-b border-border py-3 last:border-b-0">
      <h2 className="text-body font-normal">{food.name}</h2>
      <p className="mt-0.5 text-caption text-muted-foreground">
        {madeAgoLine(food.madeAt, now, food.location)}
      </p>
      <p className="mt-1.5 text-body">
        <span className="font-semibold text-primary">
          <RemainingWords food={food} />
        </span>{" "}
        left
      </p>
      <div
        className="mt-2 -mb-1 flex flex-wrap items-center gap-y-1"
        aria-describedby={error ? errorId : undefined}
      >
        <Pill
          variant="pale"
          className="mr-1"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const { remaining } = await consume({ preparedFoodId: food._id });
              if (remaining.decimal === 0) toast(`${food.name}: all gone.`);
            })
          }
        >
          Ate one
        </Pill>
        <Pill ref={ateOpener} variant="text" disabled={pending} onClick={() => setAteSome(true)}>
          Ate…
        </Pill>
        <Pill
          variant="text"
          className="px-2.5"
          disabled={pending}
          onClick={() =>
            run(async () => {
              await move({ preparedFoodId: food._id, location: other });
              toast(`${food.name}: in the ${other}.`);
            })
          }
        >
          To the {other}
        </Pill>
        <ConfirmDialog
          trigger={
            <Pill variant="text" className="px-2.5 text-destructive" disabled={pending}>
              Toss
            </Pill>
          }
          title={`Toss ${food.name}?`}
          description={`${amountWords(food.remaining.text, food.remaining.decimal, food.unit)} left. It comes off the leftovers.`}
          confirmLabel="Toss"
          destructive
          onConfirm={async () => {
            await discard({ preparedFoodId: food._id });
            toast(`Tossed ${food.name}.`);
          }}
        />
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-caption text-destructive">
          {error}
        </p>
      )}
      <AteSomeSheet food={food} open={ateSome} onOpenChange={setAteSome} opener={ateOpener} />
    </li>
  );
}

/** "7 sliders", with the figure set apart from the words. */
export function RemainingWords({ food }: { food: Leftover }) {
  const { text, decimal } = food.remaining;
  // amountWords always leads with the recipe's own figure.
  const unit = amountWords(text, decimal, food.unit).slice(text.length);
  return (
    <>
      <span className="tabular">{text}</span>
      {unit}
    </>
  );
}
