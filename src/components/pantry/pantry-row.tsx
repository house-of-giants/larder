import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Button } from "#/components/ui/button";
import { errorMessage } from "#/lib/errors";
import type { Level } from "#/lib/levels";
import { cn } from "#/lib/utils";
import { LevelChips } from "./level-chips";
import { isOut, type PantryRowData } from "./pantry-data";
import { PantryItemSheet } from "./pantry-item-sheet";

/**
 * One thing on the shelf. Counts show the amount in the household's own words and open a
 * sheet on tap; levels set straight from the chips. Either way, "Out" is one tap.
 */
export function PantryRow({ row }: { row: PantryRowData }) {
  const setLevel = useMutation(api.pantry.setLevel);
  const markOut = useMutation(api.pantry.markOut);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const out = isOut(row);
  const errorId = `pantry-row-${row.ingredientId}-error`;

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
    <li className="flex flex-col">
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-describedby={error ? errorId : undefined}
          className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 rounded-md py-2 pl-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className={cn("truncate", out && "text-muted-foreground")}>{row.name}</span>
          {row.kind === "count" && row.count && (
            <span
              className={cn(
                "num shrink-0 text-sm",
                out ? "text-muted-foreground" : "text-foreground",
              )}
            >
              {out ? "Out" : `${row.count.quantityText} ${row.count.unit}`}
            </span>
          )}
        </button>
        {row.kind === "level" ? (
          <LevelChips
            name={row.name}
            value={row.level}
            disabled={pending}
            onChange={(level: Level) =>
              run(() => setLevel({ ingredientId: row.ingredientId, level }))
            }
          />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="min-h-10 min-w-14"
            disabled={pending || out}
            aria-label={`Mark ${row.name} out`}
            onClick={() => run(() => markOut({ ingredientId: row.ingredientId }))}
          >
            Out
          </Button>
        )}
      </div>
      {error && (
        <p id={errorId} role="alert" className="px-4 pb-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <PantryItemSheet row={row} open={open} onOpenChange={setOpen} />
    </li>
  );
}
