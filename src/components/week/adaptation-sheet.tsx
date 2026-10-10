import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { IngredientPicker } from "#/components/recipes/ingredient-picker";
import type { IngredientOption } from "#/components/recipes/recipe-text";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { errorMessage } from "#/lib/errors";
import { type Adaptation, adaptationKindLabels } from "./labels";

type Kind = Adaptation["kind"];
const kinds: Kind[] = ["replace", "add", "remove", "adjust"];

/** A change to one recipe for this week only: swap, add, leave out, or a new amount. */
export function AdaptationSheet({
  weekId,
  recipeId,
  recipeName,
  ingredients,
  open,
  onOpenChange,
}: {
  weekId: Id<"weeks">;
  recipeId: Id<"recipes">;
  recipeName: string;
  ingredients: readonly IngredientOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-2xl rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Change for this week</SheetTitle>
          <SheetDescription>{recipeName}</SheetDescription>
        </SheetHeader>
        <AdaptationForm
          weekId={weekId}
          recipeId={recipeId}
          ingredients={ingredients}
          close={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

// Mounted only while the sheet is open, so every opening starts blank.
function AdaptationForm({
  weekId,
  recipeId,
  ingredients,
  close,
}: {
  weekId: Id<"weeks">;
  recipeId: Id<"recipes">;
  ingredients: readonly IngredientOption[];
  close: () => void;
}) {
  const addAdaptation = useMutation(api.weeks.addAdaptation);
  const [kind, setKind] = useState<Kind>("replace");
  const [original, setOriginal] = useState<Id<"ingredients"> | null>(null);
  const [replacement, setReplacement] = useState<Id<"ingredients"> | null>(null);
  const [quantityText, setQuantityText] = useState("");
  const [unit, setUnit] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const needsOriginal = kind !== "add";
  const needsReplacement = kind === "replace" || kind === "add";
  const takesAmount = kind !== "remove";

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await addAdaptation({
        weekId,
        recipeId,
        kind,
        description,
        originalIngredientId: needsOriginal ? (original ?? undefined) : undefined,
        newIngredientId: needsReplacement ? (replacement ?? undefined) : undefined,
        quantityText: takesAmount ? quantityText : undefined,
        unit: takesAmount ? unit : undefined,
      });
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  const id = (field: string) => `adaptation-${recipeId}-${field}`;

  return (
    <form
      className="flex flex-col gap-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      onSubmit={submit}
      noValidate
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("kind")}>What changes</Label>
        <Select value={kind} onValueChange={(value) => setKind(value as Kind)}>
          <SelectTrigger id={id("kind")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((k) => (
              <SelectItem key={k} value={k}>
                {adaptationKindLabels[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {needsOriginal && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("original")}>{kind === "replace" ? "Instead of" : "Ingredient"}</Label>
          <IngredientPicker
            id={id("original")}
            options={ingredients}
            value={original}
            onChange={setOriginal}
          />
        </div>
      )}

      {needsReplacement && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id("new")}>{kind === "replace" ? "Use" : "Ingredient"}</Label>
          <IngredientPicker
            id={id("new")}
            options={ingredients}
            value={replacement}
            onChange={setReplacement}
          />
        </div>
      )}

      {takesAmount && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("quantity")}>How much</Label>
            <Input
              id={id("quantity")}
              value={quantityText}
              placeholder="1 1/2"
              autoComplete="off"
              enterKeyHint="next"
              className="tabular"
              onChange={(e) => setQuantityText(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("unit")}>Unit</Label>
            <Input
              id={id("unit")}
              value={unit}
              placeholder="lb"
              autoComplete="off"
              autoCapitalize="none"
              enterKeyHint="next"
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor={id("description")}>Note</Label>
        <Input
          id={id("description")}
          value={description}
          placeholder="Cook raw sausage to 160°F first"
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <Button type="submit" disabled={pending}>
        Save change
      </Button>
      {error && (
        <p role="alert" className="-mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
