import { type ComponentProps, type ReactNode, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Input } from "#/components/ui/input";
import { parseQuantity } from "#/lib/quantities";
import { cn } from "#/lib/utils";

const quickPicks = ["1/2", "1", "2"] as const;

const squareOff = "border-border bg-card text-foreground";
const squareOn = "border-transparent bg-accent text-accent-foreground";

/**
 * How many: batches planned, batches made, portions eaten. One control everywhere it is
 * asked: squares for 1/2, 1 and 2, each with its word under the number, and "Other…" for
 * any other amount. The typed field opens only on that tap, so the control never raises a
 * keyboard by itself; once a typed amount is done (Enter, or focus leaves with a number in
 * it) the field closes and the amount shows where Other… was ("1 1/2 batches"). Tapping
 * it opens the field again with the text selected. The picked choice is tomato pale.
 *
 * `compact` (the plan's rows) keeps the squares to their content and makes Other… a quiet
 * text action beside them, with the field taking its place while it is open.
 *
 * `pressed` says which choice shows picked when that is not simply the typed value (the
 * plan keeps a draft apart from what is saved). `onPick` handles a pick on its own (it
 * defaults to `onChange`); `fieldProps` and `pickProps` add handlers to the field and to
 * each square. `caption` sits under the control ("1 batch makes 8 biscuits.").
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
  compact = false,
  caption,
  fieldProps,
  pickProps,
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  error: string | null;
  label?: string;
  /** The word under a number: one (1/2 and 1) and many. */
  unit?: { one: string; many: string };
  pressed?: string;
  onPick?: (pick: string) => void;
  compact?: boolean;
  caption?: ReactNode;
  fieldProps?: Omit<ComponentProps<"input">, "id" | "value" | "onChange">;
  pickProps?: Omit<ComponentProps<"button">, "onClick">;
}) {
  const [typing, setTyping] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const picked = parseQuantity(pressed);
  const quick = quickPicks.find((pick) => parseQuantity(pick) === picked);
  // A number that is not one of the three: it shows where Other… was, picked.
  const custom = picked !== null && picked > 0 && quick === undefined;
  const wordFor = (decimal: number) => (decimal > 1 ? unit.many : unit.one);
  const customWord = custom ? wordFor(picked) : "";

  function openField() {
    // Synchronously, so the focus lands inside the tap and a phone raises its keyboard.
    flushSync(() => setTyping(true));
    field.current?.focus();
    // What is there is replaced by what is typed, not added to.
    field.current?.select();
  }

  // Done typing: a number above zero closes the field; anything else keeps it open to fix.
  function settle(text: string) {
    const typed = parseQuantity(text);
    if (typed !== null && typed > 0) setTyping(false);
  }

  const squares = quickPicks.map((pick) => {
    const on = pick === quick;
    const word = wordFor(parseQuantity(pick)!);
    return (
      <button
        key={pick}
        type="button"
        aria-pressed={on}
        className={cn(
          "flex h-14 min-w-0 flex-col items-center justify-center rounded-(--radius) border outline-none focus-ring",
          compact && "w-16",
          on ? squareOn : squareOff,
        )}
        {...pickProps}
        onClick={() => {
          setTyping(false);
          onPick(pick);
        }}
      >
        <span className="tabular text-body leading-none">{pick}</span>
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
  });

  const typed = (
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
      onKeyDown={(e) => {
        fieldProps?.onKeyDown?.(e);
        if (e.key === "Enter" && !e.defaultPrevented) {
          // Enter finishes the amount; it never submits the form around it.
          e.preventDefault();
          settle(e.currentTarget.value);
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        fieldProps?.onBlur?.(e);
        settle(e.currentTarget.value);
      }}
    />
  );

  const otherLabel = custom ? (
    <>
      <span className="tabular">{pressed.trim()}</span>
      {customWord && ` ${customWord}`}
    </>
  ) : (
    "Other…"
  );

  return (
    <div className="flex flex-col gap-2">
      {compact ? (
        <div className="flex items-center gap-2.5">
          <fieldset className="flex gap-2.5">
            <legend className="sr-only">{label}</legend>
            {squares}
          </fieldset>
          <div id={`${id}-typed`} hidden={!typing}>
            {typed}
          </div>
          {!typing && (
            <button
              type="button"
              aria-expanded={false}
              aria-controls={`${id}-typed`}
              className={cn(
                "min-h-11 rounded-full px-3 text-subhead outline-none focus-ring",
                custom
                  ? "bg-accent font-semibold text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              onClick={openField}
            >
              {otherLabel}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2.5">
            <fieldset className="col-span-3 grid grid-cols-3 gap-2.5">
              <legend className="sr-only">{label}</legend>
              {squares}
            </fieldset>
            <button
              type="button"
              aria-expanded={typing}
              aria-controls={`${id}-typed`}
              className={cn(
                "flex h-14 min-w-0 flex-col items-center justify-center rounded-(--radius) border px-1 outline-none focus-ring",
                custom ? squareOn : squareOff,
              )}
              onClick={openField}
            >
              {custom ? (
                <>
                  <span className="tabular max-w-full truncate text-body leading-none">
                    {pressed.trim()}
                  </span>
                  {customWord && (
                    <span className="mt-1 text-label text-accent-foreground">{customWord}</span>
                  )}
                </>
              ) : (
                <span className="text-subhead text-muted-foreground">Other…</span>
              )}
            </button>
          </div>
          <div id={`${id}-typed`} hidden={!typing}>
            {typed}
          </div>
        </>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
      {caption}
    </div>
  );
}
