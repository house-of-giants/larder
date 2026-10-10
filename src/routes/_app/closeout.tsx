import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { CloseoutCard, type Outcome } from "#/components/leftovers/closeout-card";
import type { Leftover } from "#/components/leftovers/types";
import { CloseoutSkeleton } from "#/components/page-skeleton";
import { Pill } from "#/components/kit/pill";
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

  if (week === undefined || foods === undefined) return <CloseoutSkeleton />;
  if (week === null || week.status === "planning") {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-start px-5 pt-3">
        <h1 className="font-display text-display">Close the week</h1>
        <p className="mt-1 text-body text-muted-foreground">
          {week === null
            ? "No week open."
            : "Nothing to close yet. This week is still being planned."}
        </p>
        <Pill variant="text" asChild className="-ml-5">
          <Link to="/week">Back to the week</Link>
        </Pill>
      </main>
    );
  }
  return <CloseoutForm week={week} foods={foods} />;
}

function CloseoutForm({ week, foods }: { week: CurrentWeek; foods: Leftover[] }) {
  const run = useMutation(api.closeout.run);
  const undoEvents = useMutation(api.undo.events);
  const navigate = useNavigate();
  // Only the overrides; everything else is all eaten.
  const [outcomes, setOutcomes] = useState<ReadonlyMap<Id<"preparedFoods">, Outcome>>(new Map());
  const decisions = [...outcomes]
    .filter(([id]) => foods.some((f) => f._id === id))
    .map(([preparedFoodId, outcome]) => ({ preparedFoodId, outcome }));
  // Read once when the screen opens; the new week is named for today.
  const [nextWeekOf] = useState(() => localIsoDate(new Date()));
  const nextWeek = weekOfLabel(nextWeekOf).replace(/^Week/, "week");

  /** Thrown errors stay in the confirm dialog as a sentence. */
  async function close() {
    const { undoEventIds } = await run({ weekId: week._id, decisions, weekOf: nextWeekOf });
    // The closeout's own events; with nothing in the fridge there is nothing to take back.
    toast(
      "Week closed. A new one is ready to plan.",
      undoEventIds.length === 0
        ? undefined
        : { action: { label: "Undo", onClick: () => void takeBack(undoEventIds) } },
    );
    await navigate({ to: "/week" });
  }

  /** Puts the leftovers back as they were, all or none; the new week stays. */
  async function takeBack(eventIds: Id<"inventoryEvents">[]) {
    try {
      await undoEvents({ eventIds });
      toast("Undone.");
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const question =
    foods.length === 0
      ? `Start the ${nextWeek}?`
      : decisions.some((d) => d.outcome !== "eaten")
        ? `Sort the leftovers as marked and start the ${nextWeek}?`
        : `Count the leftovers as eaten and start the ${nextWeek}?`;

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-3rem-4rem-2px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-2xl flex-col px-5 pt-3">
      <h1 className="font-display text-display">Close the week</h1>
      <p className="mt-1 text-caption text-muted-foreground">
        {weekOfLabel(week.weekOf)}.{" "}
        {foods.length === 0
          ? "Nothing left in the fridge to sort."
          : "Everything counts as eaten unless you say otherwise."}
      </p>
      {foods.length > 0 && (
        <ul className="mt-1 flex flex-col">
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
      {/* The screen's one pill, pinned over the tab bar on a paper fade (the week's pattern). */}
      <div className="sticky bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-10 -mx-5 mt-auto flex flex-col items-center bg-linear-to-b from-transparent to-background to-40% px-5 pt-9 pb-3">
        <ConfirmDialog
          trigger={
            <Pill type="button" className="min-w-50">
              Close the week
            </Pill>
          }
          title="Close the week?"
          description={question}
          confirmLabel="Close the week"
          onConfirm={close}
        />
      </div>
    </main>
  );
}
