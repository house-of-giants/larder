import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Pill } from "#/components/kit/pill";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { errorMessage } from "#/lib/errors";
import type { Level } from "#/lib/levels";
import { LOCATIONS, type Location } from "#/lib/locations";
import { parseQuantity } from "#/lib/quantities";
import { LevelChips } from "./level-chips";
import { locationLabels } from "./labels";

export type StockValues =
  | { kind: "count"; quantityText: string; unit: string; location: Location }
  | { kind: "level"; level: Level; location: Location };

export type StockDraft = {
  quantityText: string;
  unit: string;
  level: Level;
  location: Location;
};

/** Writes a StockForm's values to the pantry row for one ingredient. */
export function useSaveStock() {
  const setCount = useMutation(api.pantry.setCount);
  const setLevel = useMutation(api.pantry.setLevel);
  return async (ingredientId: Id<"ingredients">, values: StockValues) => {
    if (values.kind === "count") {
      const { quantityText, unit, location } = values;
      await setCount({ ingredientId, quantityText, unit, location });
    } else {
      const { level, location } = values;
      await setLevel({ ingredientId, level, location });
    }
  };
}

/**
 * How much there is and where it lives. Every field is a local draft; nothing is written
 * until Save. A count must parse as a number or fraction before it is sent.
 */
export function StockForm({
  idPrefix,
  name,
  kind,
  initial,
  submitLabel = "Save",
  onSave,
  busy = false,
  onPendingChange,
  id: formId,
  showLevel = true,
}: {
  idPrefix: string;
  name: string;
  kind: "count" | "level";
  initial: StockDraft;
  submitLabel?: string;
  /** Runs on Save. A thrown error stays under the Save button as a plain sentence. */
  onSave: (values: StockValues) => Promise<void>;
  /** Something else in the same sheet is writing; hold Save until it finishes. */
  busy?: boolean;
  /** Told when a Save starts and ends, so the sheet can hold its other buttons. */
  onPendingChange?: (pending: boolean) => void;
  /** The form's id, for a submit pill outside it (a sheet footer); it then has no button. */
  id?: string;
  /** A level's chips; off where the sheet sets the level itself, on tap. */
  showLevel?: boolean;
}) {
  const [quantityText, setQuantityText] = useState(initial.quantityText);
  const [unit, setUnit] = useState(initial.unit);
  const [level, setLevel] = useState(initial.level);
  const [location, setLocation] = useState(initial.location);
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const pending = saving || busy;
  function setPending(next: boolean) {
    setSaving(next);
    onPendingChange?.(next);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setSaveError(null);
    if (kind === "count") {
      const badQuantity = parseQuantity(quantityText) === null;
      const noUnit = unit.trim() === "";
      setQuantityError(badQuantity ? "Use a number or a fraction." : null);
      setUnitError(noUnit ? "Add a unit, like each or lb." : null);
      if (badQuantity || noUnit) return;
    }
    setPending(true);
    try {
      await onSave(
        kind === "count" ? { kind, quantityText, unit, location } : { kind, level, location },
      );
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  const id = (field: string) => `${idPrefix}-${field}`;
  const label = "text-caption font-normal text-muted-foreground";

  return (
    <form id={formId} className="flex flex-col gap-4" onSubmit={submit} noValidate>
      {kind === "count" ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor={id("quantity")} className={label}>
              How many
            </Label>
            <Input
              id={id("quantity")}
              value={quantityText}
              autoComplete="off"
              enterKeyHint="done"
              className="tabular"
              aria-invalid={quantityError !== null}
              aria-describedby={quantityError ? id("quantity-error") : undefined}
              onChange={(e) => setQuantityText(e.target.value)}
            />
            {quantityError && (
              <p id={id("quantity-error")} role="alert" className="text-caption text-destructive">
                {quantityError}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={id("unit")} className={label}>
              Unit
            </Label>
            <Input
              id={id("unit")}
              value={unit}
              autoComplete="off"
              autoCapitalize="none"
              enterKeyHint="done"
              aria-invalid={unitError !== null}
              aria-describedby={unitError ? id("unit-error") : undefined}
              onChange={(e) => setUnit(e.target.value)}
            />
            {unitError && (
              <p id={id("unit-error")} role="alert" className="text-caption text-destructive">
                {unitError}
              </p>
            )}
          </div>
        </div>
      ) : (
        showLevel && (
          <div className="flex flex-col gap-1">
            <span className={label}>How much is left</span>
            <LevelChips name={name} value={level} onChange={setLevel} disabled={pending} />
          </div>
        )
      )}

      <div className="flex flex-col gap-1">
        <Label htmlFor={id("location")} className={label}>
          Where it lives
        </Label>
        <Select value={location} onValueChange={(value) => setLocation(value as Location)}>
          <SelectTrigger id={id("location")} className="w-full data-[size=default]:h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LOCATIONS.map((l) => (
              <SelectItem key={l} value={l}>
                {locationLabels[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* With a form id, the pill that submits it lives in the sheet's footer. */}
      {formId === undefined && (
        <Pill sheet type="submit" disabled={pending}>
          {submitLabel}
        </Pill>
      )}
      {saveError && (
        <p role="alert" className="text-caption text-destructive">
          {saveError}
        </p>
      )}
    </form>
  );
}
