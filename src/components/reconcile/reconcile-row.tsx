import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { LevelChips } from "#/components/pantry/level-chips";
import { amountText } from "#/components/recipes/recipe-text";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { errorMessage } from "#/lib/errors";
import type { Level } from "#/lib/levels";
import { parseQuantity } from "#/lib/quantities";

export type ReconcileItem = FunctionReturnType<typeof api.lists.reconcileItems>[number];

/** "The week needs 22 tbsp" or, for split units, "1 tbsp and 2 tsp". */
function neededText(item: ReconcileItem): string {
  return `The week needs ${item.required.map((r) => amountText(r.quantityText, r.unit)).join(" and ")}`;
}

/**
 * One ingredient the list depends on, with what the pantry says. A count is a draft until
 * Save; a level saves on tap. `onSaved` tells the screen the list needs a fresh run.
 */
export function ReconcileRow({ item, onSaved }: { item: ReconcileItem; onSaved: () => void }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{item.name}</span>
        <span className="num text-sm text-muted-foreground">{neededText(item)}</span>
      </div>
      {item.kind === "count" ? (
        <CountEditor item={item} onSaved={onSaved} />
      ) : (
        <LevelEditor item={item} onSaved={onSaved} />
      )}
    </li>
  );
}

function CountEditor({ item, onSaved }: { item: ReconcileItem; onSaved: () => void }) {
  const setCount = useMutation(api.pantry.setCount);
  const saved = item.count?.quantityText ?? "";
  const unit = item.count?.unit ?? item.required[0]?.unit ?? item.defaultUnit ?? "";
  // null until edited, so the field follows the saved count as it changes elsewhere.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const value = draft ?? saved;
  const id = `reconcile-${item.ingredientId}`;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (draft === null || draft.trim() === saved) return;
    if (parseQuantity(draft) === null) {
      setError("Use a number or a fraction.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      await setCount({ ingredientId: item.ingredientId, quantityText: draft, unit });
      setDraft(null);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-2" onSubmit={save} noValidate>
      <div className="flex items-center gap-2">
        <label htmlFor={id} className="sr-only">
          How much {item.name} is on hand
        </label>
        <Input
          id={id}
          value={value}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          className="num h-10 w-24"
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setDraft(e.target.value)}
        />
        <span className="text-sm text-muted-foreground">{unit}</span>
        <Button
          type="submit"
          variant="outline"
          className="ml-auto h-10"
          disabled={pending || draft === null || draft.trim() === saved}
        >
          Save
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

function LevelEditor({ item, onSaved }: { item: ReconcileItem; onSaved: () => void }) {
  const setLevel = useMutation(api.pantry.setLevel);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(level: Level) {
    setPending(true);
    setError(null);
    try {
      await setLevel({ ingredientId: item.ingredientId, level });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <LevelChips name={item.name} value={item.level} onChange={change} disabled={pending} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
