import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ArrowDown, ArrowUp, ChevronRight, Plus, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Chip } from "#/components/kit/chip";
import { Pill } from "#/components/kit/pill";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { errorMessage } from "#/lib/errors";
import { IngredientPicker } from "./ingredient-picker";
import {
  draftToArgs,
  emptyIngredient,
  emptyStep,
  type DraftIngredient,
  type RecipeDraft,
} from "./recipe-draft";
import type { IngredientOption } from "./recipe-text";

const unitSuggestions = [
  "each",
  "lb",
  "oz",
  "g",
  "kg",
  "cup",
  "tbsp",
  "tsp",
  "slice",
  "package",
  "can",
  "jar",
  "sprig",
  "pinch",
  "clove",
];
const unitListId = "recipe-units";

type RecipeEditorProps = {
  initial: RecipeDraft;
  /** Absent for a new recipe. */
  recipeId?: Id<"recipes">;
};

/**
 * One editor for new and existing recipes. Every field edits a local draft; Save sends it
 * in one upsert, Cancel drops it.
 */
export function RecipeEditor({ initial, recipeId }: RecipeEditorProps) {
  const navigate = useNavigate();
  const upsert = useMutation(api.recipes.upsert);
  const createIngredient = useMutation(api.recipes.createIngredientInline);
  const options = useQuery(api.recipes.ingredientOptions, {}) ?? [];

  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof RecipeDraft>(key: K, value: RecipeDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const setIngredient = (key: string, patch: Partial<DraftIngredient>) =>
    setDraft((d) => ({
      ...d,
      ingredients: d.ingredients.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));

  function cancel() {
    if (recipeId) void navigate({ to: "/recipes/$recipeId", params: { recipeId } });
    else void navigate({ to: "/recipes" });
  }

  async function save() {
    const result = draftToArgs(draft, recipeId);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await upsert(result.args);
      await navigate({ to: "/recipes/$recipeId", params: { recipeId: id } });
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <form
      // Fields and headings stop clear of the sticky footer when focus or a jump scrolls to them.
      className="flex flex-col gap-8 [&_h2]:scroll-mb-36 [&_input]:scroll-mb-36 [&_textarea]:scroll-mb-36"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <datalist id={unitListId}>
        {unitSuggestions.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </datalist>

      <Section title="Recipe">
        <Field label="Name" htmlFor="recipe-name">
          <Input
            id="recipe-name"
            value={draft.name}
            autoComplete="off"
            onChange={(e) => set("name", e.target.value)}
          />
        </Field>
        <Field label="Source title" htmlFor="recipe-source-title">
          <Input
            id="recipe-source-title"
            value={draft.sourceTitle}
            autoComplete="off"
            onChange={(e) => set("sourceTitle", e.target.value)}
          />
        </Field>
        <Field label="Source link" htmlFor="recipe-source-url">
          <Input
            id="recipe-source-url"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={draft.sourceUrl}
            autoComplete="off"
            onChange={(e) => set("sourceUrl", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <Field label="Makes" htmlFor="recipe-yield">
            <Input
              id="recipe-yield"
              className="tabular"
              value={draft.yieldText}
              autoComplete="off"
              onChange={(e) => set("yieldText", e.target.value)}
            />
          </Field>
          <Field label="Of what" htmlFor="recipe-yield-unit">
            <Input
              id="recipe-yield-unit"
              value={draft.yieldUnit}
              autoComplete="off"
              onChange={(e) => set("yieldUnit", e.target.value)}
            />
          </Field>
        </div>
        <Check
          id="recipe-freezer"
          checked={draft.freezerFriendly === true}
          onChange={(checked) => set("freezerFriendly", checked)}
        >
          Freezer friendly
        </Check>
        <Field label="Tags" htmlFor="recipe-tags" hint="Separate with commas.">
          <Input
            id="recipe-tags"
            value={draft.tags}
            autoComplete="off"
            onChange={(e) => set("tags", e.target.value)}
          />
        </Field>
        <Check
          id="recipe-needs-review"
          checked={draft.needsReview}
          onChange={(checked) => set("needsReview", checked)}
        >
          Mark it to check later
        </Check>
      </Section>

      <Section title="Ingredients">
        <ol className="flex flex-col border-t border-border">
          {draft.ingredients.map((row, index) => (
            <IngredientRow
              key={row.key}
              row={row}
              index={index}
              count={draft.ingredients.length}
              options={options}
              onChange={(patch) => setIngredient(row.key, patch)}
              onCreate={(name) => createIngredient({ name })}
              onMove={(by) => set("ingredients", move(draft.ingredients, index, by))}
              onRemove={() =>
                set(
                  "ingredients",
                  draft.ingredients.filter((r) => r.key !== row.key),
                )
              }
            />
          ))}
        </ol>
        <Pill
          variant="text"
          className="-ml-5 self-start"
          onClick={() => set("ingredients", [...draft.ingredients, emptyIngredient()])}
        >
          <Plus aria-hidden />
          Add ingredient
        </Pill>
      </Section>

      <Section title="Steps">
        <ol className="flex flex-col gap-4">
          {draft.steps.map((step, index) => (
            <li key={step.key} className="flex flex-col gap-1">
              <div className="flex min-h-11 items-center justify-between gap-3">
                <Label htmlFor={`step-${step.key}`} className={labelClass}>
                  Step <span className="tabular">{index + 1}</span>
                </Label>
                <Pill
                  variant="text"
                  className="-mr-5"
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() =>
                    set(
                      "steps",
                      draft.steps.filter((s) => s.key !== step.key),
                    )
                  }
                >
                  Remove
                </Pill>
              </div>
              <Textarea
                id={`step-${step.key}`}
                value={step.text}
                onChange={(e) =>
                  set(
                    "steps",
                    draft.steps.map((s) =>
                      s.key === step.key ? { ...s, text: e.target.value } : s,
                    ),
                  )
                }
              />
            </li>
          ))}
        </ol>
        <Pill
          variant="text"
          className="-ml-5 self-start"
          onClick={() => set("steps", [...draft.steps, emptyStep()])}
        >
          <Plus aria-hidden />
          Add step
        </Pill>
      </Section>

      <Section title="Keeping">
        <Field label="Storage" htmlFor="recipe-storage">
          <Textarea
            id="recipe-storage"
            value={draft.storageNotes}
            onChange={(e) => set("storageNotes", e.target.value)}
          />
        </Field>
        <Field label="Reheating" htmlFor="recipe-reheating">
          <Textarea
            id="recipe-reheating"
            value={draft.reheatingNotes}
            onChange={(e) => set("reheatingNotes", e.target.value)}
          />
        </Field>
      </Section>

      {/* Pinned over the tab bar on its own paper, with a hairline above, in thumb reach. */}
      <div className="sticky bottom-(--nav-offset) z-10 -mx-5 flex flex-col gap-2 border-t border-border bg-background px-5 py-3">
        {error && (
          <p role="alert" className="text-caption text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          <Pill variant="text" onClick={cancel}>
            Cancel
          </Pill>
          <Pill type="submit" className="min-w-32" disabled={saving}>
            {saving ? "Saving" : "Save"}
          </Pill>
        </div>
      </div>
    </form>
  );
}

type IngredientRowProps = {
  row: DraftIngredient;
  index: number;
  count: number;
  options: readonly IngredientOption[];
  onChange: (patch: Partial<DraftIngredient>) => void;
  onCreate: (name: string) => Promise<Id<"ingredients">>;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
};

function IngredientRow({
  row,
  index,
  count,
  options,
  onChange,
  onCreate,
  onMove,
  onRemove,
}: IngredientRowProps) {
  const id = (field: string) => `ingredient-${row.key}-${field}`;
  const line = index + 1;

  return (
    <li className="flex flex-col gap-3 border-b border-border pt-1 pb-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-muted-foreground">
          Line <span className="tabular">{line}</span>
        </span>
        <div className="-mr-2.5 flex">
          <IconAction
            label={`Move line ${line} up`}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp aria-hidden />
          </IconAction>
          <IconAction
            label={`Move line ${line} down`}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown aria-hidden />
          </IconAction>
          <IconAction label={`Remove line ${line}`} onClick={onRemove}>
            <X aria-hidden />
          </IconAction>
        </div>
      </div>

      <Field label="Ingredient" htmlFor={id("ingredient")}>
        <IngredientPicker
          id={id("ingredient")}
          options={options}
          value={row.ingredientId}
          onCreate={onCreate}
          onChange={(ingredientId) =>
            // A different ingredient makes the old recipe wording wrong; fall back to the name.
            onChange(ingredientId === row.ingredientId ? {} : { ingredientId, displayName: "" })
          }
        />
      </Field>
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Amount" htmlFor={id("quantity")}>
          <Input
            id={id("quantity")}
            className="tabular"
            value={row.quantityText}
            autoComplete="off"
            onChange={(e) => onChange({ quantityText: e.target.value })}
          />
        </Field>
        <Field label="Unit" htmlFor={id("unit")}>
          <Input
            id={id("unit")}
            list={unitListId}
            value={row.unit}
            autoComplete="off"
            autoCapitalize="none"
            onChange={(e) => onChange({ unit: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Preparation" htmlFor={id("preparation")}>
        <Input
          id={id("preparation")}
          value={row.preparation}
          autoComplete="off"
          onChange={(e) => onChange({ preparation: e.target.value })}
        />
      </Field>
      <Check
        id={id("optional")}
        checked={row.optional}
        onChange={(optional) => onChange({ optional })}
      >
        Optional
      </Check>

      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 self-start rounded-sm text-subhead text-muted-foreground select-none focus-ring [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="size-4 transition-transform duration-[120ms] group-open:rotate-90"
          />
          More
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <Field
            label="Recipe's wording"
            htmlFor={id("display")}
            hint="Shown instead of the ingredient's name."
          >
            <Input
              id={id("display")}
              value={row.displayName}
              autoComplete="off"
              onChange={(e) => onChange({ displayName: e.target.value })}
            />
          </Field>
          <Field
            label="Take from the pantry as"
            htmlFor={id("deduction")}
            hint="When cooking uses up a different pantry item, like yolks from eggs."
          >
            <div className="flex gap-2">
              <div className="flex-1">
                <IngredientPicker
                  id={id("deduction")}
                  options={options}
                  value={row.deductionIngredientId}
                  placeholder="Same ingredient"
                  onChange={(deductionIngredientId) => onChange({ deductionIngredientId })}
                />
              </div>
              {row.deductionIngredientId !== null && (
                <Pill
                  variant="text"
                  className="-mr-5"
                  onClick={() => onChange({ deductionIngredientId: null })}
                >
                  Clear
                </Pill>
              )}
            </div>
          </Field>
          <Field label="Note" htmlFor={id("deduction-note")}>
            <Input
              id={id("deduction-note")}
              value={row.deductionNote}
              autoComplete="off"
              onChange={(e) => onChange({ deductionNote: e.target.value })}
            />
          </Field>
        </div>
      </details>
    </li>
  );
}

function move<T>(items: readonly T[], index: number, by: -1 | 1): T[] {
  const target = index + by;
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

const labelClass = "text-subhead font-normal";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-title">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className={labelClass}>
        {label}
      </Label>
      {children}
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** A yes-or-no about the recipe, as a chip: tomato pale when on. */
function Check({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Chip id={id} selected={checked} className="self-start" onClick={() => onChange(!checked)}>
      {children}
    </Chip>
  );
}

/** A 44px round icon button in quiet ink, for moving and removing a line. */
function IconAction({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-11 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-ring disabled:opacity-40 [&_svg]:size-[18px]"
    >
      {children}
    </button>
  );
}
