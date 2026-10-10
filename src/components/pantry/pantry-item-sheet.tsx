import { useMutation } from "convex/react";
import { type RefObject, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Chip } from "#/components/kit/chip";
import { HalfSheet } from "#/components/kit/half-sheet";
import { Pill } from "#/components/kit/pill";
import { errorMessage } from "#/lib/errors";
import { LEVELS, type Level } from "#/lib/levels";
import { countOf, levelOf } from "#/lib/pantry-amount";
import { levelLabels, locationLabels } from "./labels";
import { isOut, type PantryRowData } from "./pantry-data";
import { StockForm, useSaveStock } from "./stock-form";

/**
 * One pantry row in a half sheet. Out comes first: for a level, the four chips (Full to
 * Out), each saved on tap; for a count, an Out text action. Then the amount and where it
 * lives, saved by the footer pill, and last, under a hairline, Remove from pantry.
 * Nothing takes focus on open, so no keyboard rises until a field is tapped.
 */
export function PantryItemSheet({
  row,
  open,
  onOpenChange,
  opener,
  fallbackFocus,
}: {
  row: PantryRowData;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener: RefObject<HTMLElement | null>;
  /** Where focus goes when the row is gone after Remove: the screen's title. */
  fallbackFocus: RefObject<HTMLElement | null>;
}) {
  const formId = `pantry-${row.ingredientId}-form`;
  const saveStock = useSaveStock();
  const markOut = useMutation(api.pantry.markOut);
  const setLevel = useMutation(api.pantry.setLevel);
  const remove = useMutation(api.pantry.remove);
  const [error, setError] = useState<string | null>(null);
  // One flag for Save, Out, a level and Remove: while any of them is writing, the others wait.
  const [pending, setPending] = useState(false);
  const close = () => onOpenChange(false);

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
    <HalfSheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setError(null);
      }}
      opener={opener}
      fallbackFocus={fallbackFocus}
      quietOpen
      title={row.name}
      note={locationLabels[row.location]}
      footer={
        <div className="flex flex-col">
          <Pill sheet type="submit" form={formId} disabled={pending}>
            Save
          </Pill>
          <div className="mt-3 border-t border-border pt-1">
            <Pill
              variant="text"
              className="-ml-5 text-destructive"
              disabled={pending}
              onClick={() => run(() => remove({ ingredientId: row.ingredientId }))}
            >
              Remove from pantry
            </Pill>
          </div>
        </div>
      }
    >
      {/* Mounted only while open, so every opening starts from the saved row. */}
      {open && (
        <div className="flex flex-col gap-4 pb-2">
          {row.kind === "level" ? (
            <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
              <legend className="text-subhead">How much is left</legend>
              <div className="flex gap-2">
                {LEVELS.map((level: Level) => {
                  const current = level === row.level;
                  return (
                    <Chip
                      key={level}
                      selected={current}
                      disabled={pending}
                      className="min-w-14 disabled:opacity-60"
                      onClick={() => {
                        // The level it already has: nothing to write, the sheet just closes.
                        if (current) return close();
                        void run(() => setLevel({ ingredientId: row.ingredientId, level }));
                      }}
                    >
                      {levelLabels[level]}
                    </Chip>
                  );
                })}
              </div>
            </fieldset>
          ) : (
            <Pill
              variant="text"
              className="-ml-5 self-start"
              disabled={pending || isOut(row)}
              onClick={() => run(() => markOut({ ingredientId: row.ingredientId }))}
            >
              {isOut(row) ? "Out" : "Mark it out"}
            </Pill>
          )}
          <StockForm
            id={formId}
            idPrefix={`pantry-${row.ingredientId}`}
            name={row.name}
            kind={row.kind}
            showLevel={false}
            initial={{
              quantityText: countOf(row)?.quantityText ?? "",
              unit: countOf(row)?.unit ?? "",
              level: levelOf(row) ?? "full",
              location: row.location,
            }}
            busy={pending}
            onPendingChange={setPending}
            onSave={async (values) => {
              await saveStock(row.ingredientId, values);
              close();
            }}
          />
          {error && (
            <p role="alert" className="text-caption text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </HalfSheet>
  );
}
