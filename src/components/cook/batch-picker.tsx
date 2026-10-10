import { type ComponentProps, type ReactNode, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Input } from "#/components/ui/input";
import { parseQuantity } from "#/lib/quantities";
import { cn } from "#/lib/utils";
import { batchFigure } from "./batch-line";

const quickPicks = ["1/2", "1", "2"] as const;

const square =
  "flex h-14 min-w-0 flex-col items-center justify-center rounded-(--radius) border outline-none focus-ring";
const squareOff = "border-border bg-card text-foreground";
const squareOn = "border-transparent bg-accent text-accent-foreground";

/**
 * How many: batches planned, batches made, portions eaten. One control everywhere it is
 * asked: three squares for ½, 1 and 2, each with its word under the number, and a fourth,
 * "Other…", that opens the typed field. The field opens only on that tap, so the control
 * never raises a keyboard by itself; a typed amount that is not one of the three shows in
 * the fourth square. The picked square is tomato pale.
 *
 * `pressed` says which square shows picked when that is not simply the typed value (the
 * plan keeps a draft apart from what is saved). `onPick` handles a pick on its own (it
 * defaults to `onChange`); `fieldProps` and `pickProps` add handlers to the field and to
 * each of the three squares. `caption` sits under the squares ("1 batch makes 8 biscuits.").
 */
export function BatchPicker({
  id,
  value,
  onChange,
  error,
  label = "Batches",
  unit = { one: "batch", many: "batches" },
  pressed = value.trim(),
  onPick = onChange,
  caption,
  fieldProps,
  pickProps,
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  error: string | null;
  label?: string;
  /** The word under a number: one (½ and 1) and many. */
  unit?: { one: string; many: string };
  pressed?: string;
  onPick?: (pick: string) => void;
  caption?: ReactNode;
  fieldProps?: Omit<ComponentProps<"input">, "id" | "value" | "onChange">;
  pickProps?: Omit<ComponentProps<"button">, "onClick">;
}) {
  const [typing, setTyping] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const picked = parseQuantity(pressed);
  const quick = quickPicks.find((pick) => parseQuantity(pick) === picked);
  // A number that is not one of the three: it shows in the fourth square, picked.
  const custom = picked !== null && picked > 0 && quick === undefined;
  const wordFor = (decimal: number) => (decimal > 1 ? unit.many : unit.one);

  function openField() {
    // Synchronously, so the focus lands inside the tap and a phone raises its keyboard.
    flushSync(() => setTyping(true));
    field.current?.focus();
    // What is there is replaced by what is typed, not added to.
    field.current?.select();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-2.5">
        <fieldset className="col-span-3 grid grid-cols-3 gap-2.5">
          <legend className="sr-only">{label}</legend>
          {quickPicks.map((pick) => {
            const on = pick === quick;
            const word = wordFor(parseQuantity(pick)!);
            return (
              <button
                key={pick}
                type="button"
                aria-label={pick}
                aria-pressed={on}
                className={cn(square, on ? squareOn : squareOff)}
                {...pickProps}
                onClick={() => {
                  setTyping(false);
                  onPick(pick);
                }}
              >
                <span aria-hidden className="tabular text-body leading-none">
                  {batchFigure(pick)}
                </span>
                {word && (
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 text-label",
                      on ? "text-accent-foreground" : "text-muted-foreground",
                    )}
                  >
                    {word}
                  </span>
                )}
              </button>
            );
          })}
        </fieldset>
        <button
          type="button"
          aria-expanded={typing}
          aria-controls={`${id}-typed`}
          className={cn(square, "px-1", custom ? squareOn : squareOff)}
          onClick={openField}
        >
          {custom ? (
            <>
              <span className="tabular max-w-full truncate text-body leading-none">
                {batchFigure(pressed)}
              </span>
              {wordFor(picked) && (
                <span className="mt-1 text-label text-accent-foreground">{wordFor(picked)}</span>
              )}
            </>
          ) : (
            <span className="text-subhead text-muted-foreground">Other…</span>
          )}
        </button>
      </div>
      <div id={`${id}-typed`} hidden={!typing}>
        <Input
          ref={field}
          id={id}
          value={value}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          aria-label={`${label}, typed`}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          className="tabular w-24 text-center"
          {...fieldProps}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
      {caption}
    </div>
  );
}
