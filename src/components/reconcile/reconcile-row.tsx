import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { LevelChips } from "#/components/pantry/level-chips";
import { shownUnit } from "#/components/recipes/recipe-text";
import { Input } from "#/components/ui/input";
import { errorMessage } from "#/lib/errors";
import type { Level } from "#/lib/levels";
import { parseQuantity } from "#/lib/quantities";
import { NeededText } from "./needed";

export type ReconcileItem = FunctionReturnType<typeof api.lists.reconcileItems>[number];

/** How long "Saved" stays after a change goes through. */
const SAVED_MS = 1500;

/**
 * One ingredient the list depends on, in the list row's shape without the circle: the
 * name, what the week needs, and what the pantry says. A count saves when the field is
 * left or Enter is pressed; a level saves on tap. Either way "Saved" shows for a moment,
 * and `onSaved` tells the screen the list needs a fresh run.
 */
export function ReconcileRow({ item, onSaved }: { item: ReconcileItem; onSaved: () => void }) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = `reconcile-${item.ingredientId}-error`;

  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setSavedAt(null), SAVED_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const saved = () => {
    setSavedAt(Date.now());
    onSaved();
  };

  return (
    <li className="flex flex-col border-b border-border py-1.5 last:border-b-0">
      <div className="flex min-h-11 items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body">{item.name}</span>
          <span className="mt-0.5 text-caption text-muted-foreground">
            <NeededText required={item.required} />
            <span aria-live="polite">{savedAt !== null && " · Saved"}</span>
          </span>
        </div>
        {item.kind === "count" && (
          <CountEditor item={item} errorId={errorId} onError={setError} onSaved={saved} />
        )}
      </div>
      {item.kind === "level" && (
        <div className="mt-2 mb-1">
          <LevelEditor item={item} onError={setError} onSaved={saved} />
        </div>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1 mb-1 text-caption text-destructive">
          {error}
        </p>
      )}
    </li>
  );
}

function CountEditor({
  item,
  errorId,
  onError,
  onSaved,
}: {
  item: ReconcileItem;
  errorId: string;
  onError: (error: string | null) => void;
  onSaved: () => void;
}) {
  const setCount = useMutation(api.pantry.setCount);
  const saved = item.count?.quantityText ?? "";
  const unit = item.count?.unit ?? item.required[0]?.unit ?? item.defaultUnit ?? "";
  // null until edited, so the field follows the saved count as it changes elsewhere.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  // Enter then blur would send the same change twice; one save runs at a time.
  const saving = useRef(false);
  const id = `reconcile-${item.ingredientId}`;

  async function commit() {
    if (draft === null || draft.trim() === saved || saving.current) return;
    if (parseQuantity(draft) === null) {
      setInvalid(true);
      onError("Use a number or a fraction.");
      return;
    }
    saving.current = true;
    setInvalid(false);
    onError(null);
    try {
      await setCount({ ingredientId: item.ingredientId, quantityText: draft, unit });
      setDraft(null);
      onSaved();
    } catch (err) {
      setInvalid(true);
      onError(errorMessage(err));
    } finally {
      saving.current = false;
    }
  }

  return (
    <form
      className="flex shrink-0 items-center gap-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void commit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        How much {item.name} is on hand
      </label>
      <Input
        id={id}
        value={draft ?? saved}
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="done"
        className="tabular w-20 text-right"
        aria-invalid={invalid}
        aria-describedby={invalid ? errorId : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
      />
      <span className="min-w-8 text-caption text-muted-foreground">{shownUnit(unit)}</span>
    </form>
  );
}

function LevelEditor({
  item,
  onError,
  onSaved,
}: {
  item: ReconcileItem;
  onError: (error: string | null) => void;
  onSaved: () => void;
}) {
  const setLevel = useMutation(api.pantry.setLevel);
  const [pending, setPending] = useState(false);

  async function change(level: Level) {
    setPending(true);
    onError(null);
    try {
      await setLevel({ ingredientId: item.ingredientId, level });
      onSaved();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return <LevelChips name={item.name} value={item.level} onChange={change} disabled={pending} />;
}
