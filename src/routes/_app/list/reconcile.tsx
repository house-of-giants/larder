import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useMemo, useRef, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AisleHeading } from "#/components/kit/aisle-heading";
import { Pill } from "#/components/kit/pill";
import { ReconcileSkeleton } from "#/components/page-skeleton";
import { categoryLabels } from "#/components/pantry/labels";
import { ReconcileRow, type ReconcileItem } from "#/components/reconcile/reconcile-row";
import { leaveStep, type SaveTracker } from "#/components/reconcile/saves";
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

  if (week === undefined || (week !== null && items === undefined)) return <ReconcileSkeleton />;

  // Only what the pantry already holds needs a second look; the rest is bought in full.
  const onHand = (items ?? []).filter((i) => i.count !== undefined || i.level !== undefined);

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-5 pt-3">
      <h1 className="font-display text-display">Before you shop</h1>
      <p className="mt-1 text-caption text-muted-foreground">
        The list counts on these. Fix anything that is off.
      </p>
      <p className="text-caption text-muted-foreground">
        Things you count take a number. Things you eyeball take Full, Half, Low or Out.
      </p>
      {week === null ? (
        <div className="flex flex-col items-start gap-3 pt-6">
          <p className="text-muted-foreground">No week started.</p>
          <Pill variant="outline" asChild>
            <Link to="/week">This week</Link>
          </Pill>
        </div>
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
  const edited = useRef(false);
  const saves = useRef(new Set<Promise<boolean>>());
  const failingRows = useRef(new Set<string>());
  const tracker = useMemo<SaveTracker>(
    () => ({
      track: (save) => {
        saves.current.add(save);
        void save.finally(() => saves.current.delete(save));
      },
      failing: (key, failing) => {
        if (failing) failingRows.current.add(key);
        else failingRows.current.delete(key);
      },
    }),
    [],
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function done() {
    setPending(true);
    setError(null);
    // A field still being edited saves when it is left; Safari keeps focus in it when a
    // button is tapped, so leave it here, then wait for every save in flight.
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur();
    const outcomes = await Promise.all(saves.current);
    const step = leaveStep({
      outcomes,
      failing: failingRows.current.size > 0,
      edited: edited.current,
    });
    if (step === "stay") {
      setError("A change above did not save. Fix it, then try again.");
      setPending(false);
      return;
    }
    try {
      if (step === "regenerate") await generate({ weekId });
      await navigate({ to: "/list" });
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  const sections = [...new Set(items.map((i) => i.category))];

  return (
    <>
      {items.length === 0 ? (
        <p className="pt-6 text-muted-foreground">
          Nothing on this list is in the pantry. Buy it all.
        </p>
      ) : (
        sections.map((section) => {
          const headingId = `reconcile-${section}`;
          return (
            <section key={section} aria-labelledby={headingId} className="flex flex-col">
              <AisleHeading id={headingId} title={categoryLabels[section] ?? section} />
              <ul className="flex flex-col">
                {items
                  .filter((i) => i.category === section)
                  .map((item) => (
                    <ReconcileRow
                      key={item.ingredientId}
                      item={item}
                      tracker={tracker}
                      onSaved={() => {
                        edited.current = true;
                      }}
                    />
                  ))}
              </ul>
            </section>
          );
        })
      )}
      {/* In thumb reach above the tab bar, on a paper fade, wherever the list is scrolled. */}
      <div className="sticky bottom-(--nav-offset) z-10 -mx-5 mt-2 flex flex-col items-center gap-2 bg-linear-to-b from-transparent to-background to-40% px-5 pt-9 pb-3">
        <Pill onClick={done} disabled={pending} className="min-w-50">
          Looks right
        </Pill>
        {error && (
          <p role="alert" className="text-caption text-destructive">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
