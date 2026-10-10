import { useMutation } from "convex/react";
import { type ReactNode, type RefObject, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Amount } from "#/components/kit/amount";
import { HalfSheet } from "#/components/kit/half-sheet";
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
import { resolveIngredient, suggestIngredients } from "#/lib/aliases";
import { defaultLocation } from "#/lib/locations";
import { countOf, levelOf } from "#/lib/pantry-amount";
import { categoryLabels, locationLabels } from "./labels";
import type { PantryRowData } from "./pantry-data";
import { shelfLine } from "./shelf-line";
import { StockForm, useSaveStock, type StockValues } from "./stock-form";

const fieldLabel = "text-caption font-normal text-muted-foreground";

type Props = { ingredients: Doc<"ingredients">[]; rows: PantryRowData[] };

/** Find an ingredient (or make one) and put it on the shelf, in a half sheet off the Fab. */
export function AddToPantry({
  open,
  onOpenChange,
  opener,
  ...props
}: Props & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener: RefObject<HTMLElement | null>;
}) {
  return (
    <HalfSheet
      open={open}
      onOpenChange={onOpenChange}
      opener={opener}
      title="Add to pantry"
      note="Pick what you have, or add something new."
    >
      {open && <AddBody {...props} close={() => onOpenChange(false)} />}
    </HalfSheet>
  );
}

type Choice = { kind: "existing"; ingredient: Doc<"ingredients"> } | { kind: "new"; name: string };

// Mounted only while the sheet is open, so each opening starts empty.
function AddBody({ ingredients, rows, close }: Props & { close: () => void }) {
  const [draft, setDraft] = useState("");
  const [choice, setChoice] = useState<Choice | null>(null);
  const saveStock = useSaveStock();

  const rowFor = useMemo(() => new Map(rows.map((r) => [r.ingredientId, r])), [rows]);
  const byId = useMemo(() => new Map(ingredients.map((i) => [i._id, i])), [ingredients]);
  // All in memory: the household's ingredients are already loaded, so no round trip per key.
  const suggestions = useMemo(
    () =>
      suggestIngredients(draft, ingredients).flatMap((id) => {
        const ingredient = byId.get(id);
        return ingredient ? [ingredient] : [];
      }),
    [draft, ingredients, byId],
  );
  const newName = draft.trim().replace(/\s+/g, " ");
  const canAddNew = newName !== "" && resolveIngredient(newName, ingredients).kind === "none";

  function saved(name: string) {
    toast(`${name}: saved.`);
    close();
  }

  if (choice?.kind === "existing") {
    const { ingredient } = choice;
    const row = rowFor.get(ingredient._id);
    return (
      <Body>
        <Chosen name={ingredient.name} onChange={() => setChoice(null)} />
        <StockForm
          idPrefix="add-existing"
          name={ingredient.name}
          kind={ingredient.kind}
          initial={{
            quantityText: countOf(row)?.quantityText ?? "",
            unit: countOf(row)?.unit ?? ingredient.defaultUnit ?? "",
            level: levelOf(row) ?? "full",
            location: row?.location ?? defaultLocation(ingredient.category),
          }}
          submitLabel={row ? "Save" : "Add"}
          onSave={async (values) => {
            await saveStock(ingredient._id, values);
            saved(ingredient.name);
          }}
        />
      </Body>
    );
  }

  if (choice?.kind === "new") {
    return (
      <Body>
        <Chosen name={choice.name} onChange={() => setChoice(null)} />
        <NewIngredient
          name={choice.name}
          onSaved={() => saved(choice.name)}
          saveStock={saveStock}
        />
      </Body>
    );
  }

  return (
    <Body>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="add-name" className="text-subhead font-normal">
          What do you have?
        </Label>
        <Input
          id="add-name"
          value={draft}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(e) => setDraft(e.target.value)}
        />
      </div>
      {suggestions.length > 0 && (
        <ul aria-label="Matching ingredients" className="-mt-2 flex flex-col">
          {suggestions.map((ingredient) => (
            <li key={ingredient._id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                className="flex min-h-14 w-full flex-col justify-center rounded-md py-1.5 text-left focus-ring"
                onClick={() => setChoice({ kind: "existing", ingredient })}
              >
                <span className="text-body">{ingredient.name}</span>
                <OnShelf row={rowFor.get(ingredient._id)} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {canAddNew && (
        <Pill
          variant="text"
          className="-ml-5 h-auto min-h-11 self-start text-left whitespace-normal"
          onClick={() => setChoice({ kind: "new", name: newName })}
        >
          Add “{newName}” as a new ingredient
        </Pill>
      )}
    </Body>
  );
}

function Body({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 pb-[calc(1.125rem+env(safe-area-inset-bottom))]">
      {children}
    </div>
  );
}

function Chosen({ name, onChange }: { name: string; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-1">
      <p className="min-w-0 truncate text-body">{name}</p>
      <Pill variant="text" className="-mr-5 shrink-0" onClick={onChange}>
        Change
      </Pill>
    </div>
  );
}

/** Where it is and how much, for an ingredient already on the shelf. */
function OnShelf({ row }: { row: PantryRowData | undefined }) {
  if (!row) return null;
  const line = shelfLine(row);
  return (
    <span className="mt-0.5 text-caption text-muted-foreground">
      {line.kind === "amount" && <Amount quantityText={line.quantityText} unit={line.unit} quiet />}
      {line.kind === "level" && line.word}
      {line.kind === "out" && "out"}
      {` · ${locationLabels[row.location].toLowerCase()}`}
    </span>
  );
}

function NewIngredient({
  name,
  onSaved,
  saveStock,
}: {
  name: string;
  onSaved: () => void;
  saveStock: ReturnType<typeof useSaveStock>;
}) {
  const upsert = useMutation(api.ingredients.upsert);
  const [kind, setKind] = useState<"count" | "level">("count");
  const [category, setCategory] = useState("");
  // Set once the ingredient exists, so a retry after a failed pantry write does not make
  // a second one.
  const [createdId, setCreatedId] = useState<Id<"ingredients"> | null>(null);

  async function save(values: StockValues) {
    let id = createdId;
    if (id === null) {
      id = await upsert({
        name,
        kind,
        category,
        aliases: [],
        tracked: true,
        defaultUnit: values.kind === "count" ? values.unit : undefined,
      });
      setCreatedId(id);
    }
    await saveStock(id, values);
    onSaved();
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-kind" className={fieldLabel}>
            Kept as
          </Label>
          <Select
            value={kind}
            disabled={createdId !== null}
            onValueChange={(value) => setKind(value as "count" | "level")}
          >
            <SelectTrigger id="new-kind" className="w-full data-[size=default]:h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="count">A count (6 each, 2 lb)</SelectItem>
              <SelectItem value="level">A level (full to out)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="new-category" className={fieldLabel}>
            Store section
          </Label>
          <Select value={category} disabled={createdId !== null} onValueChange={setCategory}>
            <SelectTrigger id="new-category" className="w-full data-[size=default]:h-11">
              <SelectValue placeholder="Pick one" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(categoryLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {category === "" ? (
        <p className="text-caption text-muted-foreground">Pick a store section to go on.</p>
      ) : (
        // Keyed by section so the suggested location follows it (dairy goes in the fridge).
        <StockForm
          key={category}
          idPrefix="add-new"
          name={name}
          kind={kind}
          initial={{
            quantityText: "",
            unit: "",
            level: "full",
            location: defaultLocation(category),
          }}
          submitLabel="Add"
          onSave={save}
        />
      )}
    </>
  );
}
