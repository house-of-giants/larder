import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { HalfSheet } from "#/components/kit/half-sheet";
import { Pill } from "#/components/kit/pill";
import { Skeleton } from "#/components/ui/skeleton";
import { errorMessage } from "#/lib/errors";
import { cn } from "#/lib/utils";
import { changeWhen } from "./change-when";

type Row = FunctionReturnType<typeof api.undo.recent>[number];

const shown = 30;

/**
 * The last changes to the pantry and the leftovers, in a half sheet. A row that can be
 * taken back reads in ink with Undo beside it; one that cannot reads quiet, with why.
 */
export function UndoDrawer() {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <section className="flex flex-col items-start" aria-labelledby="undo-heading">
      <h2 id="undo-heading" className="font-display text-title">
        Undo
      </h2>
      <p className="mt-1 text-caption text-muted-foreground">
        Take back a check-off, a cook, a portion eaten, or a closeout.
      </p>
      <Pill ref={opener} variant="text" className="-ml-5" onClick={() => setOpen(true)}>
        Recent changes
      </Pill>
      <HalfSheet
        open={open}
        onOpenChange={setOpen}
        opener={opener}
        title="Recent changes"
        note="Newest first."
      >
        {open && <RecentList />}
      </HalfSheet>
    </section>
  );
}

function RecentList() {
  const { isAuthenticated } = useConvexAuth();
  const rows = useQuery(api.undo.recent, isAuthenticated ? { limit: shown } : "skip");

  if (rows === undefined) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2 pb-6">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="pb-6 text-body text-muted-foreground">Nothing changed yet.</p>;
  }
  return (
    <ul className="flex flex-col pb-[calc(1rem+env(safe-area-inset-bottom))]">
      {rows.map((row) => (
        <RecentRow key={row.eventId} row={row} />
      ))}
    </ul>
  );
}

function RecentRow({ row }: { row: Row }) {
  const undo = useMutation(api.undo.event);
  const [pending, setPending] = useState(false);

  async function take() {
    await undo({ eventId: row.eventId });
    toast("Undone.");
  }

  return (
    <li className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <div className="flex min-w-0 flex-col">
        <span className={cn("text-subhead", !row.canUndo && "text-muted-foreground")}>
          {row.line}
        </span>
        <span className="mt-0.5 text-caption text-muted-foreground">
          {changeWhen(row.at)}
          {!row.canUndo && row.reason && ` · ${row.reason}`}
        </span>
      </div>
      {row.canUndo &&
        (row.isCook ? (
          <ConfirmDialog
            trigger={
              <Pill variant="text" className="-mr-5 shrink-0">
                Undo
              </Pill>
            }
            title="Undo this cook?"
            description="Everything it took from the pantry goes back, and its leftovers come off the list."
            confirmLabel="Undo cook"
            onConfirm={take}
          />
        ) : (
          <Pill
            variant="text"
            className="-mr-5 shrink-0"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              try {
                await take();
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setPending(false);
              }
            }}
          >
            Undo
          </Pill>
        ))}
    </li>
  );
}
