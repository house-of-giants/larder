import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { MadeItButton } from "#/components/cook/made-it-button";
import { WeekSkeleton } from "#/components/page-skeleton";
import { Button } from "#/components/ui/button";
import { type CurrentWeek } from "#/components/week/labels";
import { StatusPill } from "#/components/week/status-pill";
import { errorMessage } from "#/lib/errors";
import { localIsoDate, weekOfLabel } from "#/lib/week-dates";

export const Route = createFileRoute("/_app/week/")({
  component: Week,
});

function Week() {
  const { isAuthenticated } = useConvexAuth();
  const week = useQuery(api.weeks.current, isAuthenticated ? {} : "skip");

  if (week === undefined) return <WeekSkeleton />;
  if (week === null) return <NoWeek />;
  return <ThisWeek week={week} />;
}

function NoWeek() {
  const create = useMutation(api.weeks.create);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      await create({ weekOf: localIsoDate(new Date()) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">This week</h1>
      <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed px-4 py-8">
        <p className="text-muted-foreground">No week started.</p>
        <Button onClick={start} disabled={pending}>
          Start a week
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

function ThisWeek({ week }: { week: CurrentWeek }) {
  const selected = week.recipes.filter((r) => r.status === "selected");
  const cooked = useQuery(api.cooking.forWeek, { weekId: week._id });
  const madeAt = new Map((cooked ?? []).map((c) => [c.recipeId, c]));

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{weekOfLabel(week.weekOf)}</h1>
          <StatusPill status={week.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {selected.length === 0 ? (
            "No recipes picked yet."
          ) : (
            <>
              <span className="tabular">{selected.length}</span>{" "}
              {selected.length === 1 ? "recipe" : "recipes"}
            </>
          )}
        </p>
      </div>

      <WeekActions week={week} selectedCount={selected.length} />

      {selected.length > 0 && (
        <ul className="flex flex-col gap-3">
          {selected.map((r) => {
            const made = madeAt.get(r.recipeId);
            return (
              <li
                key={r.weekRecipeId}
                className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{r.name}</span>
                  {r.multiplier.text !== "1" && (
                    <span className="text-sm text-muted-foreground">
                      <span className="tabular">{r.multiplier.text}</span> batches
                    </span>
                  )}
                  {made && (
                    <span className="tabular text-sm text-primary">
                      {madeLabel(made.cookedAt, made.times)}
                    </span>
                  )}
                </div>
                <MadeItButton
                  recipeId={r.recipeId}
                  recipeName={r.name}
                  weekId={week._id}
                  defaultMultiplier={r.multiplier.text}
                  made={made !== undefined}
                  className="h-11 shrink-0"
                />
              </li>
            );
          })}
        </ul>
      )}

      {week.status !== "planning" && (
        <Button asChild variant="outline" className="self-start">
          <Link to="/closeout">Close the week</Link>
        </Button>
      )}
    </main>
  );
}

/** "Made Sat 2:14 PM", or "Made twice, last Sat 2:14 PM". */
function madeLabel(cookedAt: number, times: number): string {
  const when = new Date(cookedAt).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  if (times === 1) return `Made ${when}`;
  return `Made ${times === 2 ? "twice" : `${times} times`}, last ${when}`;
}

function WeekActions({ week, selectedCount }: { week: CurrentWeek; selectedCount: number }) {
  const generate = useMutation(api.lists.generate);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function makeList() {
    setPending(true);
    setError(null);
    try {
      await generate({ weekId: week._id });
      await navigate({ to: "/list/reconcile" });
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  if (week.status !== "planning" && week.status !== "shopping") return null;
  const shopping = week.status === "shopping";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {shopping && (
          <Button asChild>
            <Link to="/list">Open the list</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/week/plan">Plan the week</Link>
        </Button>
        <Button
          variant={shopping ? "outline" : "default"}
          onClick={makeList}
          disabled={pending || selectedCount === 0}
        >
          {shopping ? "Make the list again" : "Make the list"}
        </Button>
      </div>
      {selectedCount === 0 && (
        <p className="text-sm text-muted-foreground">Pick a recipe to make the list.</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
