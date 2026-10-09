import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CloseoutCard, type Outcome } from "#/components/leftovers/closeout-card";
import type { Leftover } from "#/components/leftovers/types";
import { PageSkeleton } from "#/components/page-skeleton";
import { Button } from "#/components/ui/button";
import type { CurrentWeek } from "#/components/week/labels";
import { errorMessage } from "#/lib/errors";
import { localIsoDate, weekOfLabel } from "#/lib/week-dates";

export const Route = createFileRoute("/_app/closeout")({
  component: Closeout,
});

function Closeout() {
  const { isAuthenticated } = useConvexAuth();
  const week = useQuery(api.weeks.current, isAuthenticated ? {} : "skip");
  const foods = useQuery(api.leftovers.list, isAuthenticated ? {} : "skip");

  if (week === undefined || foods === undefined) return <PageSkeleton />;
  if (week === null || week.status === "planning") {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Close the week</h1>
        <p className="text-muted-foreground">
          {week === null
            ? "No week open."
            : "Nothing to close yet. This week is still being planned."}
        </p>
        <Button asChild variant="outline" className="self-start">
          <Link to="/week">Back to the week</Link>
        </Button>
      </main>
    );
  }
  return <CloseoutForm week={week} foods={foods} />;
}

function CloseoutForm({ week, foods }: { week: CurrentWeek; foods: Leftover[] }) {
  const run = useMutation(api.closeout.run);
  const navigate = useNavigate();
  // Only the overrides; everything else is all eaten.
  const [outcomes, setOutcomes] = useState<ReadonlyMap<Id<"preparedFoods">, Outcome>>(new Map());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function close() {
    setPending(true);
    setError(null);
    try {
      await run({
        weekId: week._id,
        decisions: [...outcomes]
          .filter(([id]) => foods.some((f) => f._id === id))
          .map(([preparedFoodId, outcome]) => ({ preparedFoodId, outcome })),
        weekOf: localIsoDate(new Date()),
      });
      toast("Week closed. A new one is ready to plan.");
      await navigate({ to: "/week" });
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Close the week</h1>
        <p className="text-sm text-muted-foreground">
          {weekOfLabel(week.weekOf)}.{" "}
          {foods.length === 0
            ? "Nothing left in the fridge to sort."
            : "Everything counts as eaten unless you say otherwise."}
        </p>
      </div>
      {foods.length > 0 && (
        <ul className="flex flex-col gap-3">
          {foods.map((food) => (
            <CloseoutCard
              key={food._id}
              food={food}
              outcome={outcomes.get(food._id) ?? "eaten"}
              onChange={(outcome) =>
                setOutcomes((current) => new Map(current).set(food._id, outcome))
              }
            />
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          size="lg"
          className="h-12 text-base"
          disabled={pending}
          onClick={close}
        >
          Close the week
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </main>
  );
}
