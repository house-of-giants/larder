import { Link } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { IngredientPicker } from "#/components/recipes/ingredient-picker";
import { amountText, shownUnit } from "#/components/recipes/recipe-text";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { amountWords } from "#/lib/amounts";
import { errorMessage } from "#/lib/errors";
import { parseQuantity } from "#/lib/quantities";
import { cn } from "#/lib/utils";
import { MultiplierPicker } from "./multiplier-picker";
import { summaryLines } from "./summary";

type SheetData = FunctionReturnType<typeof api.cooking.sheet>;
type Row = SheetData["rows"][number];
type Result = FunctionReturnType<typeof api.cooking.madeIt>;

const badMultiplier = "Use a number like 1/2, 1 or 2.";

/**
 * "Made it": one tap from a recipe card, the batches, anything left out or swapped, done.
 * The pantry and the leftovers follow on the server; the sheet then says what moved.
 */
export function MadeItSheet({
  recipeId,
  recipeName,
  weekId,
  defaultMultiplier = "1",
  open,
  onOpenChange,
}: {
  recipeId: Id<"recipes">;
  recipeName: string;
  weekId?: Id<"weeks">;
  defaultMultiplier?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[92dvh] w-full max-w-2xl gap-0 rounded-t-xl"
      >
        <SheetHeader>
          <SheetTitle className="pr-8 text-lg">{recipeName}</SheetTitle>
          <SheetDescription>Untick what you left out. The pantry follows.</SheetDescription>
        </SheetHeader>
        {open && (
          <MadeItBody
            recipeId={recipeId}
            weekId={weekId}
            defaultMultiplier={defaultMultiplier}
            close={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// Mounted only while the sheet is open, so every opening starts from the recipe.
function MadeItBody({
  recipeId,
  weekId,
  defaultMultiplier,
  close,
}: {
  recipeId: Id<"recipes">;
  weekId?: Id<"weeks">;
  defaultMultiplier: string;
  close: () => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const data = useQuery(api.cooking.sheet, isAuthenticated ? { recipeId } : "skip");
  const [result, setResult] = useState<Result | null>(null);

  if (result !== null) return <Summary result={result} close={close} />;
  if (data === undefined) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 px-4 pb-6">
        <span className="sr-only">Loading</span>
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return (
    <MadeItForm
      data={data}
      weekId={weekId}
      defaultMultiplier={defaultMultiplier}
      onDone={setResult}
    />
  );
}

function MadeItForm({
  data,
  weekId,
  defaultMultiplier,
  onDone,
}: {
  data: SheetData;
  weekId?: Id<"weeks">;
  defaultMultiplier: string;
  onDone: (result: Result) => void;
}) {
  const madeIt = useMutation(api.cooking.madeIt);
  const [multiplier, setMultiplier] = useState(defaultMultiplier);
  const [multiplierError, setMultiplierError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<Id<"ingredients">>>(new Set());
  const [swaps, setSwaps] = useState<ReadonlyMap<Id<"ingredients">, Id<"ingredients">>>(new Map());
  const [swapping, setSwapping] = useState<Id<"recipeIngredients"> | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = useQuery(
    api.recipes.ingredientOptions,
    swapping !== null || swaps.size > 0 ? {} : "skip",
  );

  function toggle(ingredientId: Id<"ingredients">) {
    setSkipped((current) => {
      const next = new Set(current);
      if (!next.delete(ingredientId)) next.add(ingredientId);
      return next;
    });
  }

  function swap(ingredientId: Id<"ingredients">, replacement: Id<"ingredients"> | null) {
    setSwaps((current) => {
      const next = new Map(current);
      if (replacement === null || replacement === ingredientId) next.delete(ingredientId);
      else next.set(ingredientId, replacement);
      return next;
    });
    setSwapping(null);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const decimal = parseQuantity(multiplier);
    if (decimal === null || decimal <= 0) {
      setMultiplierError(badMultiplier);
      return;
    }
    setMultiplierError(null);
    setPending(true);
    setError(null);
    try {
      const result = await madeIt({
        weekId,
        recipeId: data.recipeId,
        multiplierText: multiplier.trim(),
        skippedIngredientIds: [...skipped],
        substitutions: [...swaps]
          .filter(([ingredientId]) => !skipped.has(ingredientId))
          .map(([ingredientId, replacementIngredientId]) => ({
            ingredientId,
            replacementIngredientId,
          })),
      });
      const food = result.preparedFood;
      toast(
        food === null
          ? `Made ${result.recipeName}.`
          : `Made ${result.recipeName}. ${amountWords(food.remaining.text, food.remaining.decimal, food.unit)} in the ${food.location}.`,
      );
      onDone(result);
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  const nameOf = (id: Id<"ingredients">) => options?.find((o) => o._id === id)?.name;

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <MultiplierPicker
          id={`made-it-${data.recipeId}-batches`}
          value={multiplier}
          onChange={(text) => {
            setMultiplier(text);
            setMultiplierError(null);
          }}
          error={multiplierError}
        />
        {data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ingredients written down.</p>
        ) : (
          <ul
            aria-label="Ingredients used"
            className="flex flex-col divide-y rounded-lg border bg-card"
          >
            {data.rows.map((row) => (
              <IngredientRow
                key={row.rowId}
                row={row}
                used={!skipped.has(row.ingredientId)}
                swappedFor={(() => {
                  const id = swaps.get(row.ingredientId);
                  return id === undefined ? undefined : (nameOf(id) ?? "something else");
                })()}
                swapping={swapping === row.rowId}
                options={options}
                onToggle={() => toggle(row.ingredientId)}
                onSwapOpen={() => setSwapping(swapping === row.rowId ? null : row.rowId)}
                onSwap={(id) => swap(row.ingredientId, id)}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t bg-background px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={pending}>
          Made it
        </Button>
      </div>
    </form>
  );
}

function IngredientRow({
  row,
  used,
  swappedFor,
  swapping,
  options,
  onToggle,
  onSwapOpen,
  onSwap,
}: {
  row: Row;
  used: boolean;
  swappedFor: string | undefined;
  swapping: boolean;
  options: FunctionReturnType<typeof api.recipes.ingredientOptions> | undefined;
  onToggle: () => void;
  onSwapOpen: () => void;
  onSwap: (id: Id<"ingredients"> | null) => void;
}) {
  const checkId = `made-it-row-${row.rowId}`;
  const amount = amountText(row.quantityText, row.unit);
  const words = (
    <>
      {amount && (
        <span className="mr-1.5">
          {parseQuantity(row.quantityText) === null ? (
            row.quantityText
          ) : (
            <span className="tabular">{row.quantityText}</span>
          )}
          {shownUnit(row.unit) && ` ${shownUnit(row.unit)}`}
        </span>
      )}
      <span>{row.name}</span>
    </>
  );

  if (!row.tracked) {
    return (
      <li className="flex min-h-12 items-center gap-3 px-3 py-2 text-muted-foreground">
        <span aria-hidden className="size-5 shrink-0" />
        <span className="min-w-0 flex-1">{words}</span>
        <span className="shrink-0 text-xs">not tracked</span>
      </li>
    );
  }

  return (
    <li className="flex flex-col">
      <div className="flex min-h-12 items-center gap-3 pl-3">
        <input
          id={checkId}
          type="checkbox"
          checked={used}
          onChange={onToggle}
          className="size-5 shrink-0 accent-primary"
        />
        <label
          htmlFor={checkId}
          className={cn("min-w-0 flex-1 py-2", !used && "text-muted-foreground line-through")}
        >
          {words}
          {used && swappedFor && (
            <span className="block text-sm text-primary no-underline">Using {swappedFor}</span>
          )}
          {used && !swappedFor && row.deductsFrom && (
            <span className="block text-xs text-muted-foreground">
              Comes out of {row.deductsFrom}
            </span>
          )}
        </label>
        {used && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 shrink-0 text-muted-foreground"
            aria-expanded={swapping}
            onClick={swappedFor ? () => onSwap(null) : onSwapOpen}
          >
            {swappedFor ? "Unswap" : "Swap"}
          </Button>
        )}
      </div>
      {swapping && used && (
        <div className="px-3 pb-3">
          {options === undefined ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <IngredientPicker
              id={`${checkId}-swap`}
              options={options}
              value={null}
              placeholder={`Instead of ${row.name}`}
              onChange={(id) => onSwap(id)}
            />
          )}
        </div>
      )}
    </li>
  );
}

function Summary({ result, close }: { result: Result; close: () => void }) {
  const lines = summaryLines(result.deductions);
  const food = result.preparedFood;
  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-4" aria-live="polite">
        <p className="font-medium">
          {food === null
            ? (result.noFoodReason ?? "Done.")
            : `${amountWords(food.remaining.text, food.remaining.decimal, food.unit)} in the ${food.location}.`}
        </p>
        {lines.length > 0 && (
          <ul className="flex flex-col gap-1.5 text-sm">
            {lines.map((line) => (
              <li
                key={line.text}
                className={cn(
                  "flex items-baseline justify-between gap-3",
                  line.tone === "short" && "text-destructive",
                  line.tone === "quiet" && "text-muted-foreground",
                )}
              >
                <span>{line.text}</span>
                {line.tone === "short" && (
                  <Link
                    to="/pantry"
                    className="shrink-0 underline underline-offset-4"
                    onClick={close}
                  >
                    Fix in pantry
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button type="button" size="lg" className="h-12 w-full text-base" onClick={close}>
          Done
        </Button>
      </div>
    </div>
  );
}
