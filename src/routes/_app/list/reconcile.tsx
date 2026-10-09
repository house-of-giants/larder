import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageSkeleton } from "#/components/page-skeleton";
import { categoryLabels } from "#/components/pantry/labels";
import { ReconcileRow, type ReconcileItem } from "#/components/reconcile/reconcile-row";
import { Button } from "#/components/ui/button";
import { listPath } from "#/components/week/list-path";
import { errorMessage } from "#/lib/errors";

export const Route = createFileRoute("/_app/list/reconcile")({
  component: Reconcile,
});

function Reconcile() {
  const { isAuthenticated } = useConvexAuth();
  const week = useQuery(api.weeks.current, isAuthenticated ? {} : "skip");
  const items = useQuery(
    api.lists.reconcileItems,
    isAuthenticated && week ? { weekId: week._id } : "skip",
  );

  if (week === undefined || (week !== null && items === undefined)) return <PageSkeleton />;

  // Only what the pantry already holds needs a second look; the rest is bought in full.
  const onHand = (items ?? []).filter((i) => i.count !== undefined || i.level !== undefined);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Before you shop</h1>
        <p className="text-sm text-muted-foreground">
          The list counts on these. Fix anything that is off.
        </p>
      </div>
      {week === null ? (
        <p className="text-muted-foreground">No week started.</p>
      ) : (
        <ReconcileList weekId={week._id} items={onHand} />
      )}
    </main>
  );
}

function ReconcileList({ weekId, items }: { weekId: Id<"weeks">; items: ReconcileItem[] }) {
  const generate = useMutation(api.lists.generate);
  const navigate = useNavigate();
  // A pantry edit here changes what to buy, so the list is made again before it opens.
  const [edited, setEdited] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function done() {
    setPending(true);
    setError(null);
    try {
      if (edited) await generate({ weekId });
      await navigate({ to: listPath });
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  const sections = [...new Set(items.map((i) => i.category))];

  return (
    <>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-muted-foreground">
          Nothing on this list is in the pantry. Buy it all.
        </p>
      ) : (
        sections.map((section) => {
          const headingId = `reconcile-${section}`;
          return (
            <section key={section} aria-labelledby={headingId} className="flex flex-col gap-2">
              <h2 id={headingId} className="text-sm font-medium text-muted-foreground">
                {categoryLabels[section] ?? section}
              </h2>
              <ul className="flex flex-col divide-y rounded-lg border bg-card">
                {items
                  .filter((i) => i.category === section)
                  .map((item) => (
                    <ReconcileRow
                      key={item.ingredientId}
                      item={item}
                      onSaved={() => setEdited(true)}
                    />
                  ))}
              </ul>
            </section>
          );
        })
      )}
      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={done} disabled={pending}>
          Looks right
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
