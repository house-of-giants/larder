import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { Button } from "#/components/ui/button";
import { amountWords } from "#/lib/amounts";
import { madeAgo } from "#/lib/days-ago";
import { errorMessage } from "#/lib/errors";
import { AteSomeSheet } from "./ate-some-sheet";
import { type Leftover, placeLabels } from "./types";

/** One thing in the fridge or freezer: how much is left, where, and since when. */
export function LeftoverCard({ food, now }: { food: Leftover; now: number }) {
  const consume = useMutation(api.leftovers.consume);
  const discard = useMutation(api.leftovers.discard);
  const move = useMutation(api.leftovers.move);
  const [ateSome, setAteSome] = useState(false);
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
    <li className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="font-medium">{food.name}</h2>
          <p className="text-sm text-muted-foreground">{madeAgo(food.madeAt, now)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
          {placeLabels[food.location]}
        </span>
      </div>
      <p className="text-2xl font-semibold tracking-tight">
        <RemainingWords food={food} />
        <span className="ml-1.5 text-base font-normal text-muted-foreground">left</span>
      </p>
      <div className="flex flex-wrap gap-2" aria-describedby={error ? errorId : undefined}>
        <Button
          type="button"
          className="h-11"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const { remaining } = await consume({ preparedFoodId: food._id });
              if (remaining.decimal === 0) toast(`${food.name}: all gone.`);
            })
          }
        >
          Ate one
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={pending}
          onClick={() => setAteSome(true)}
        >
          Ate...
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={pending}
          onClick={() =>
            run(async () => {
              await move({ preparedFoodId: food._id, location: other });
              toast(`${food.name}: in the ${other}.`);
            })
          }
        >
          To the {other}
        </Button>
        <ConfirmDialog
          trigger={
            <Button
              type="button"
              variant="ghost"
              className="h-11 text-muted-foreground"
              disabled={pending}
            >
              Toss
            </Button>
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
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <AteSomeSheet food={food} open={ateSome} onOpenChange={setAteSome} />
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
