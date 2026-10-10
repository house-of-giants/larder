import { Link } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check } from "lucide-react";
import { type FormEvent, type RefObject, useState } from "react";
import { flushSync } from "react-dom";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Amount } from "#/components/kit/amount";
import { HalfSheet } from "#/components/kit/half-sheet";
import { Pill } from "#/components/kit/pill";
import { IngredientPicker } from "#/components/recipes/ingredient-picker";
import { amountText } from "#/components/recipes/recipe-text";
import { Skeleton } from "#/components/ui/skeleton";
import { amountTone } from "#/lib/amount";
import { amountWords } from "#/lib/amounts";
import { errorMessage } from "#/lib/errors";
import { parseQuantity } from "#/lib/quantities";
import { cn } from "#/lib/utils";
import { batchLine } from "./batch-line";
import { BatchPicker } from "./batch-picker";
import { summaryLines } from "./summary";

type SheetData = FunctionReturnType<typeof api.cooking.sheet>;
type Row = SheetData["rows"][number];
type Result = FunctionReturnType<typeof api.cooking.madeIt>;
type Options = FunctionReturnType<typeof api.recipes.ingredientOptions>;

const badMultiplier = "Use a number like 1/2, 1 or 2.";

/**
 * "Made it": one tap from Tonight or a recipe page, the batches, anything left out or
 * swapped, done. The pantry and the leftovers follow on the server; the sheet then turns
 * into the confirmation and says what moved. There is no toast: the sheet is the one place
 * it is said.
 */
export function MadeItSheet({
  recipeId,
  recipeName,
  weekId,
  defaultMultiplier = "1",
  open,
  onOpenChange,
  opener,
}: {
  recipeId: Id<"recipes">;
  recipeName: string;
  weekId?: Id<"weeks">;
  defaultMultiplier?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whatever opened the sheet; focus goes back there when it closes. */
  opener?: RefObject<HTMLElement | null>;
}) {
  const { isAuthenticated } = useConvexAuth();
  // Each opening is a new session: the form starts again from the recipe. What the last
  // one showed stays on screen while the sheet slides away.
  const [session, setSession] = useState(open ? 1 : 0);
  const [wasOpen, setWasOpen] = useState(open);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSession((s) => s + 1);
      setResult(null);
      setPending(false);
      setError(null);
    }
  }
  const data = useQuery(api.cooking.sheet, isAuthenticated && session > 0 ? { recipeId } : "skip");
  const formId = `made-it-${recipeId}`;
  const close = () => onOpenChange(false);

  return (
    <HalfSheet
      open={open}
      onOpenChange={onOpenChange}
      opener={opener}
      title={recipeName}
      note={result ? undefined : "Untick what you left out. The pantry follows."}
      footer={
        <>
          {error && (
            <p role="alert" className="pb-2 text-caption text-destructive">
              {error}
            </p>
          )}
          {/* One button that turns from Made it into Done, so focus stays where it was. */}
          <Pill
            sheet
            type={result ? "button" : "submit"}
            form={result ? undefined : formId}
            disabled={!result && (pending || data === undefined)}
            onClick={result ? close : undefined}
          >
            {result ? "Done" : "Made it"}
          </Pill>
        </>
      }
    >
      {/* Present from the start, so the confirmation is announced when it arrives. */}
      <div aria-live="polite">{result && <Summary result={result} close={close} />}</div>
      {!result &&
        (data === undefined ? (
          <div aria-busy="true" className="flex flex-col gap-3 pb-4">
            <span className="sr-only">Loading</span>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <MadeItForm
            key={session}
            id={formId}
            data={data}
            weekId={weekId}
            defaultMultiplier={defaultMultiplier}
            onPending={setPending}
            onError={setError}
            onDone={setResult}
          />
        ))}
    </HalfSheet>
  );
}

function MadeItForm({
  id,
  data,
  weekId,
  defaultMultiplier,
  onPending,
  onError,
  onDone,
}: {
  id: string;
  data: SheetData;
  weekId?: Id<"weeks">;
  defaultMultiplier: string;
  onPending: (pending: boolean) => void;
  onError: (error: string | null) => void;
  onDone: (result: Result) => void;
}) {
  const madeIt = useMutation(api.cooking.madeIt);
  const [multiplier, setMultiplier] = useState(defaultMultiplier);
  const [multiplierError, setMultiplierError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<ReadonlySet<Id<"ingredients">>>(new Set());
  const [swaps, setSwaps] = useState<ReadonlyMap<Id<"ingredients">, Id<"ingredients">>>(new Map());
  const [swapping, setSwapping] = useState<Id<"recipeIngredients"> | null>(null);
  // "Swap something" was tapped: the names that can be swapped show it until one is picked.
  const [choosing, setChoosing] = useState(false);
  const options = useQuery(
    api.recipes.ingredientOptions,
    swapping !== null || swaps.size > 0 || choosing ? {} : "skip",
  );
  const line = batchLine(multiplier, data.yield);
  const swappable = data.rows.some((row) => row.tracked && !skipped.has(row.ingredientId));

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

  function openSwap(row: Row) {
    setChoosing(false);
    if (swapping === row.rowId) {
      setSwapping(null);
      return;
    }
    // Synchronously, so the picker's field takes focus inside the tap.
    flushSync(() => setSwapping(row.rowId));
    document.getElementById(`${swapId(row)}`)?.focus();
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const decimal = parseQuantity(multiplier);
    if (decimal === null || decimal <= 0) {
      setMultiplierError(badMultiplier);
      return;
    }
    setMultiplierError(null);
    onPending(true);
    onError(null);
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
      onDone(result);
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      onPending(false);
    }
  }

  const nameOf = (ingredientId: Id<"ingredients">) =>
    options?.find((o) => o._id === ingredientId)?.name;

  return (
    <form id={id} onSubmit={submit} noValidate className="flex flex-col pb-2">
      <BatchPicker
        id={`${id}-batches`}
        value={multiplier}
        onChange={(text) => {
          setMultiplier(text);
          setMultiplierError(null);
        }}
        error={multiplierError}
        caption={
          line && (
            <p className="text-caption text-muted-foreground">
              <span>{line.lead}</span>{" "}
              <span className="font-semibold text-primary">{line.made}</span>.
            </p>
          )
        }
      />
      {data.rows.length === 0 ? (
        <p className="pt-4 text-body text-muted-foreground">No ingredients written down.</p>
      ) : (
        <>
          <ul aria-label="Ingredients used" className="mt-2 flex flex-col">
            {data.rows.map((row) => (
              <IngredientRow
                key={row.rowId}
                row={row}
                used={!skipped.has(row.ingredientId)}
                swappedFor={(() => {
                  const replacement = swaps.get(row.ingredientId);
                  return replacement === undefined
                    ? undefined
                    : (nameOf(replacement) ?? "something else");
                })()}
                swapping={swapping === row.rowId}
                choosing={choosing}
                options={options}
                onToggle={() => toggle(row.ingredientId)}
                onSwapOpen={() => openSwap(row)}
                onSwap={(replacement) => swap(row.ingredientId, replacement)}
              />
            ))}
          </ul>
          {swappable && (
            <Pill
              type="button"
              variant="text"
              aria-pressed={choosing}
              className={cn(
                "-ml-3 self-start px-3",
                !choosing && "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
              onClick={() => {
                setSwapping(null);
                setChoosing((c) => !c);
              }}
            >
              Swap something
            </Pill>
          )}
        </>
      )}
    </form>
  );
}

const swapId = (row: Row) => `made-it-row-${row.rowId}-swap`;

/**
 * One ingredient: the circle says whether it went in, the amount leads in tomato, and the
 * name opens the swap. Left out, the circle empties and the words go quiet, with no
 * strikethrough.
 */
function IngredientRow({
  row,
  used,
  swappedFor,
  swapping,
  choosing,
  options,
  onToggle,
  onSwapOpen,
  onSwap,
}: {
  row: Row;
  used: boolean;
  swappedFor: string | undefined;
  swapping: boolean;
  choosing: boolean;
  options: Options | undefined;
  onToggle: () => void;
  onSwapOpen: () => void;
  onSwap: (id: Id<"ingredients"> | null) => void;
}) {
  // A number leads ("8 oz bacon"); words that are not a number follow ("nonstick spray, as needed").
  const figure = amountTone(row.quantityText) === "accent";
  const hasAmount = amountText(row.quantityText, row.unit) !== "";
  const words = (quiet: boolean) => (
    <>
      {figure && (
        <>
          <Amount quantityText={row.quantityText} unit={row.unit} quiet={quiet} />{" "}
        </>
      )}
      <span className={cn(quiet && "text-muted-foreground")}>{row.name}</span>
      {!figure && hasAmount && (
        <span className="text-muted-foreground">
          , <Amount quantityText={row.quantityText} unit={row.unit} quiet />
        </span>
      )}
    </>
  );

  if (!row.tracked) {
    return (
      <li className="flex min-h-11 items-center gap-3 border-b border-border py-2.5 last:border-b-0">
        <span aria-hidden className="w-[22px] shrink-0" />
        <span className="min-w-0 flex-1 text-body">{words(true)}</span>
        <span className="shrink-0 text-caption text-muted-foreground">not tracked</span>
      </li>
    );
  }

  const label = [amountText(row.quantityText, row.unit), row.name].filter(Boolean).join(" ");
  const checkId = `made-it-row-${row.rowId}`;
  return (
    <li className="flex flex-col border-b border-border last:border-b-0">
      <div className="flex min-h-11 items-stretch gap-px">
        <label className="relative -ml-[11px] flex w-11 shrink-0 cursor-pointer items-center justify-center rounded-full has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring has-focus-visible:outline-solid">
          <input
            id={checkId}
            type="checkbox"
            checked={used}
            onChange={onToggle}
            aria-label={label}
            className="sr-only"
          />
          <span
            aria-hidden
            className={cn(
              "flex size-[22px] items-center justify-center rounded-full border-[1.5px] transition-colors duration-[120ms] ease-[cubic-bezier(0.2,0,0,1)]",
              used
                ? "border-primary bg-primary text-primary-foreground"
                : "border-ring-quiet bg-transparent",
            )}
          >
            {used && <Check className="size-3.5" strokeWidth={3} />}
          </span>
        </label>
        {used ? (
          <button
            type="button"
            aria-expanded={swapping}
            aria-controls={swapping ? swapId(row) : undefined}
            onClick={onSwapOpen}
            className="min-w-0 flex-1 rounded-sm py-2.5 text-left text-body outline-none focus-ring"
          >
            <span className="sr-only">Swap </span>
            <span
              className={cn(
                choosing &&
                  "underline decoration-ring-quiet decoration-dotted decoration-[1.5px] underline-offset-4",
              )}
            >
              {words(false)}
            </span>
          </button>
        ) : (
          // Left out, the name is the circle's label too: tapping it puts the row back.
          <label htmlFor={checkId} className="min-w-0 flex-1 cursor-pointer py-2.5 text-body">
            {words(true)}
          </label>
        )}
      </div>
      {used && swappedFor && (
        <p className="-mt-1.5 flex items-center gap-2 pb-2.5 pl-[34px] text-caption">
          <span className="text-primary">Using {swappedFor}</span>
          <button
            type="button"
            onClick={() => onSwap(null)}
            className="relative rounded-sm text-muted-foreground outline-none hover:text-foreground focus-ring after:absolute after:-inset-x-2 after:-inset-y-3.5"
          >
            Unswap
          </button>
        </p>
      )}
      {used && !swappedFor && row.deductsFrom && (
        <p className="-mt-1.5 pb-2 pl-[34px] text-caption text-muted-foreground">
          Comes out of {row.deductsFrom}
        </p>
      )}
      {swapping && used && (
        <div className="pb-3 pl-[34px]">
          {options === undefined ? (
            <Skeleton className="h-11 w-full" />
          ) : (
            <IngredientPicker
              id={swapId(row)}
              options={options}
              value={null}
              placeholder={`Instead of ${row.name}`}
              onChange={(replacement) => onSwap(replacement)}
            />
          )}
        </div>
      )}
    </li>
  );
}

/** The confirmation: "Made it.", what is in the fridge now, then what the pantry gave. */
function Summary({ result, close }: { result: Result; close: () => void }) {
  const lines = summaryLines(result.deductions);
  const food = result.preparedFood;
  return (
    <div className="flex flex-col pb-2">
      <p className="font-display text-title">Made it.</p>
      <p className="mt-1 text-body">
        {food === null
          ? (result.noFoodReason ?? "Done.")
          : `${amountWords(food.remaining.text, food.remaining.decimal, food.unit)} in the ${food.location}.`}
      </p>
      {lines.length > 0 && (
        <ul className="mt-3 flex flex-col border-t border-border">
          {lines.map((line) => (
            <li
              key={line.text}
              className={cn(
                "flex min-h-11 items-center justify-between gap-3 border-b border-border py-2 text-subhead last:border-b-0",
                line.tone === "short" && "text-destructive",
                line.tone === "quiet" && "text-muted-foreground",
              )}
            >
              <span>{line.text}</span>
              {line.tone === "short" && (
                <Link
                  to="/pantry"
                  onClick={close}
                  className="relative shrink-0 rounded-sm font-semibold outline-none focus-ring after:absolute after:-inset-x-1 after:-inset-y-3"
                >
                  Fix in pantry
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
