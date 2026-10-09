import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { errorMessage } from "#/lib/errors";
import { type PickEvent, multiplierChange, pickState } from "#/lib/multiplier";
import { parseQuantity } from "#/lib/quantities";
import { cn } from "#/lib/utils";

const quickPicks = ["1/2", "1", "2"] as const;
const badMultiplier = "Use a number like 1/2, 1 or 2.";

/**
 * How many batches of a selected recipe. The field is a draft until it loses focus (or
 * Enter); the quick picks save at once. Shows the words as typed: "1 1/2", not 1.5.
 */
export function MultiplierField({
  weekId,
  recipeId,
  text,
}: {
  weekId: Id<"weeks">;
  recipeId: Id<"recipes">;
  text: string;
}) {
  const setRecipe = useMutation(api.weeks.setRecipe);
  // null while not editing, so the field follows the saved value as it changes elsewhere.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const discard = useRef(false);
  // The text of the save on its way to the server, so a later tap compares against it.
  const inFlight = useRef<string | null>(null);
  // Set while a quick pick is pressed: the field's blur then drops its draft, so the tap
  // decides the value instead of racing the typed text.
  const picking = useRef(false);
  const onPick = (event: PickEvent) => {
    picking.current = pickState(picking.current, event);
  };
  const id = `multiplier-${recipeId}`;

  async function save(multiplierText: string) {
    const next = multiplierChange(multiplierText, { inFlight: inFlight.current, saved: text });
    if (next === null) {
      setDraft(null);
      setError(null);
      return;
    }
    const decimal = parseQuantity(next);
    if (decimal === null || decimal <= 0) {
      setError(badMultiplier);
      return;
    }
    inFlight.current = next;
    try {
      await setRecipe({ weekId, recipeId, status: "selected", multiplierText: next });
      setDraft((current) => (current === multiplierText ? null : current));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      if (inFlight.current === next) inFlight.current = null;
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        (e.currentTarget.elements.namedItem(id) as HTMLInputElement).blur();
      }}
    >
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="mr-auto text-sm text-muted-foreground">
          Batches
        </Label>
        <Input
          id={id}
          name={id}
          value={draft ?? text}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          className="num h-10 w-20 text-center"
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onFocus={() => setDraft((d) => d ?? text)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (discard.current || picking.current) {
              discard.current = false;
              setDraft(null);
              return;
            }
            if (draft !== null) void save(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              discard.current = true;
              setDraft(null);
              setError(null);
              e.currentTarget.blur();
            }
          }}
        />
        {quickPicks.map((pick) => (
          <Button
            key={pick}
            type="button"
            variant="outline"
            size="sm"
            aria-pressed={text === pick}
            className={cn("num h-10 min-w-11", text === pick && "border-primary text-primary")}
            onPointerDown={() => onPick("pointerdown")}
            onPointerUp={() => onPick("pointerup")}
            onPointerCancel={() => onPick("pointercancel")}
            onBlur={() => onPick("blur")}
            onClick={() => {
              onPick("click");
              setDraft(null);
              void save(pick);
            }}
          >
            {pick}
          </Button>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
