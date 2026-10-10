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
import { pluralUnit } from "#/lib/units";
import { NeededText } from "./needed";
import { afterSave, type SaveTracker } from "./saves";

export type ReconcileItem = FunctionReturnType<typeof api.lists.reconcileItems>[number];

/** How long "Saved" stays after a change goes through. */
const SAVED_MS = 1500;

/**
 * One ingredient the list depends on, in the list row's shape without the circle: the
 * name, what the week needs, and what the pantry says. A count saves when the field is
 * left or Enter is pressed; a level saves on tap. Either way "Saved" shows for a moment.
 * Every save goes through `tracker`, so "Looks right" can wait for it and stop on a
 * failure; `onSaved` tells the screen the list needs a fresh run.
 */
export function ReconcileRow({
  item,
  tracker,
  onSaved,
}: {
  item: ReconcileItem;
  tracker: SaveTracker;
  onSaved: () => void;
}) {
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorId = `reconcile-${item.ingredientId}-error`;

  useEffect(() => {
    if (savedAt === null) return;
    const timer = setTimeout(() => setSavedAt(null), SAVED_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);

  const report = (next: string | null) => {
    setError(next);
    tracker.failing(item.ingredientId, next !== null);
  };
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
          <CountEditor
            item={item}
            errorId={errorId}
            invalid={error !== null}
            tracker={tracker}
            onError={report}
            onSaved={saved}
          />
        )}
      </div>
      {item.kind === "level" && (
        <div className="mt-2 mb-1">
          <LevelEditor item={item} tracker={tracker} onError={report} onSaved={saved} />
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
  invalid,
  tracker,
  onError,
  onSaved,
}: {
  item: ReconcileItem;
  errorId: string;
  invalid: boolean;
  tracker: SaveTracker;
  onError: (error: string | null) => void;
  onSaved: () => void;
}) {
  const setCount = useMutation(api.pantry.setCount);
  const saved = item.count?.quantityText ?? "";
  const unit = item.count?.unit ?? item.required[0]?.unit ?? item.defaultUnit ?? "";
  // null until edited, so the field follows the saved count as it changes elsewhere. The
  // ref mirrors it for a save that lands after newer typing.
  const [draft, setDraftState] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const setDraft = (next: string | null) => {
    draftRef.current = next;
    setDraftState(next);
  };
  // One save at a time; a commit asked for meanwhile runs when it lands.
  const inflight = useRef<Promise<boolean> | null>(null);
  const requested = useRef(false);
  const id = `reconcile-${item.ingredientId}`;

  function commit(): Promise<boolean> | null {
    if (inflight.current) {
      requested.current = true;
      return inflight.current;
    }
    const sent = draftRef.current;
    if (sent === null || sent.trim() === saved) {
      onError(null);
      return null;
    }
    if (parseQuantity(sent) === null) {
      onError("Use a number or a fraction.");
      return null;
    }
    onError(null);
    const run = (async () => {
      try {
        await setCount({ ingredientId: item.ingredientId, quantityText: sent, unit });
      } catch (err) {
        inflight.current = null;
        requested.current = false;
        onError(errorMessage(err));
        return false;
      }
      const next = afterSave(sent, draftRef.current, requested.current);
      inflight.current = null;
      requested.current = false;
      setDraft(next.draft);
      onSaved();
      if (!next.commitAgain) return true;
      return (await commit()) ?? true;
    })();
    inflight.current = run;
    tracker.track(run);
    return run;
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
      <span className="min-w-8 text-caption text-muted-foreground">
        {pluralUnit(draft ?? saved, shownUnit(unit))}
      </span>
    </form>
  );
}

function LevelEditor({
  item,
  tracker,
  onError,
  onSaved,
}: {
  item: ReconcileItem;
  tracker: SaveTracker;
  onError: (error: string | null) => void;
  onSaved: () => void;
}) {
  const setLevel = useMutation(api.pantry.setLevel);
  const [pending, setPending] = useState(false);

  function change(level: Level) {
    setPending(true);
    onError(null);
    const run = (async () => {
      try {
        await setLevel({ ingredientId: item.ingredientId, level });
        onSaved();
        return true;
      } catch (err) {
        onError(errorMessage(err));
        return false;
      } finally {
        setPending(false);
      }
    })();
    tracker.track(run);
  }

  return <LevelChips name={item.name} value={item.level} onChange={change} disabled={pending} />;
}
