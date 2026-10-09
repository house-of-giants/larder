import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { errorMessage } from "#/lib/errors";

type Row = FunctionReturnType<typeof api.undo.recent>[number];

const shown = 30;

/** The last changes to the pantry and the leftovers, with Undo on the ones that can be. */
export function UndoDrawer() {
  const [open, setOpen] = useState(false);
  return (
    <section className="flex flex-col items-start gap-2" aria-labelledby="undo-heading">
      <h2 id="undo-heading" className="font-medium">
        Undo
      </h2>
      <p className="text-sm text-muted-foreground">
        Take back a check-off, a cook, a portion eaten, or a closeout.
      </p>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Recent changes
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[85dvh] w-full max-w-2xl rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Recent changes</SheetTitle>
            <SheetDescription>Newest first.</SheetDescription>
          </SheetHeader>
          {open && <RecentList />}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function RecentList() {
  const { isAuthenticated } = useConvexAuth();
  const rows = useQuery(api.undo.recent, isAuthenticated ? { limit: shown } : "skip");

  if (rows === undefined) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2 px-4 pb-6">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (rows.length === 0) {
    return <p className="px-4 pb-6 text-muted-foreground">Nothing changed yet.</p>;
  }
  return (
    <ul className="flex min-h-0 flex-col divide-y overflow-y-auto border-t px-4 pb-[env(safe-area-inset-bottom)]">
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
    <li className="flex min-h-14 items-center justify-between gap-3 py-2">
      <div className="flex min-w-0 flex-col">
        <span className="truncate">{row.line}</span>
        <span className="num text-xs text-muted-foreground">{when(row.at)}</span>
      </div>
      {row.canUndo &&
        (row.isCook ? (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="outline" size="sm" className="h-10 shrink-0">
                Undo
              </Button>
            }
            title="Undo this cook?"
            description="Everything it took from the pantry goes back, and its leftovers come off the list."
            confirmLabel="Undo cook"
            onConfirm={take}
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 shrink-0"
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
          </Button>
        ))}
    </li>
  );
}

function when(at: number): string {
  return new Date(at).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
