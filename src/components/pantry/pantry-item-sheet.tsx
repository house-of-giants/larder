import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Button } from "#/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { errorMessage } from "#/lib/errors";
import { locationLabels } from "./labels";
import { isOut, type PantryRowData } from "./pantry-data";
import { StockForm, useSaveStock } from "./stock-form";

/** Edit one pantry row: amount or level, where it lives, out, or off the shelf. */
export function PantryItemSheet({
  row,
  open,
  onOpenChange,
}: {
  row: PantryRowData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-2xl rounded-t-xl">
        <SheetHeader>
          <SheetTitle>{row.name}</SheetTitle>
          <SheetDescription>{locationLabels[row.location]}</SheetDescription>
        </SheetHeader>
        <SheetBody row={row} close={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

// Mounted only while the sheet is open, so every opening starts from the saved row.
function SheetBody({ row, close }: { row: PantryRowData; close: () => void }) {
  const saveStock = useSaveStock();
  const markOut = useMutation(api.pantry.markOut);
  const remove = useMutation(api.pantry.remove);
  const [error, setError] = useState<string | null>(null);
  // One flag for Save, Out, and Remove: while any of them is writing, the others wait.
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setError(null);
    try {
      await action();
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <StockForm
        idPrefix={`pantry-${row.ingredientId}`}
        name={row.name}
        kind={row.kind}
        initial={{
          quantityText: row.count?.quantityText ?? "",
          unit: row.count?.unit ?? "",
          level: row.level ?? "full",
          location: row.location,
        }}
        busy={pending}
        onPendingChange={setPending}
        onSave={async (values) => {
          await saveStock(row.ingredientId, values);
          close();
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          disabled={pending || isOut(row)}
          onClick={() => run(() => markOut({ ingredientId: row.ingredientId }))}
        >
          Out
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="flex-1 text-destructive"
          disabled={pending}
          onClick={() => run(() => remove({ ingredientId: row.ingredientId }))}
        >
          Remove from pantry
        </Button>
      </div>
      {error && (
        <p role="alert" className="-mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
