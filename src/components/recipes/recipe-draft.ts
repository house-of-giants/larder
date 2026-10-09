import type { FunctionArgs } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Recipe } from "./recipe-text";

// The editor's local draft. It holds strings exactly as typed and becomes upsert arguments
// once, on Save.

export type UpsertArgs = FunctionArgs<typeof api.recipes.upsert>;

export type DraftIngredient = {
  key: string;
  ingredientId: Id<"ingredients"> | null;
  displayName: string;
  quantityText: string;
  unit: string;
  optional: boolean;
  preparation: string;
  deductionIngredientId: Id<"ingredients"> | null;
  deductionNote: string;
  needsReview: boolean;
};

export type DraftStep = { key: string; text: string };

export type RecipeDraft = {
  name: string;
  /** Source fields the editor does not show, carried through untouched. */
  sourceKept: { type?: string; author?: string; date?: string };
  sourceTitle: string;
  sourceUrl: string;
  yieldText: string;
  yieldUnit: string;
  freezerFriendly: boolean | undefined;
  storageNotes: string;
  reheatingNotes: string;
  /** Comma-separated, as typed. */
  tags: string;
  steps: DraftStep[];
  needsReview: boolean;
  ingredients: DraftIngredient[];
};

let nextKey = 0;
/** A React key for a row that has no id yet. */
export function newKey(): string {
  nextKey += 1;
  return `k${nextKey}`;
}

export function emptyIngredient(): DraftIngredient {
  return {
    key: newKey(),
    ingredientId: null,
    displayName: "",
    quantityText: "",
    unit: "",
    optional: false,
    preparation: "",
    deductionIngredientId: null,
    deductionNote: "",
    needsReview: false,
  };
}

export function emptyStep(): DraftStep {
  return { key: newKey(), text: "" };
}

export function emptyDraft(): RecipeDraft {
  return {
    name: "",
    sourceKept: {},
    sourceTitle: "",
    sourceUrl: "",
    yieldText: "",
    yieldUnit: "",
    freezerFriendly: undefined,
    storageNotes: "",
    reheatingNotes: "",
    tags: "",
    steps: [emptyStep()],
    needsReview: false,
    ingredients: [emptyIngredient()],
  };
}

export function draftFromRecipe(recipe: Recipe): RecipeDraft {
  const { title, url, ...kept } = recipe.source ?? {};
  return {
    name: recipe.name,
    sourceKept: kept,
    sourceTitle: title ?? "",
    sourceUrl: url ?? "",
    yieldText: recipe.yield?.quantityText ?? "",
    yieldUnit: recipe.yield?.unit ?? "",
    freezerFriendly: recipe.freezerFriendly,
    storageNotes: recipe.storageNotes ?? "",
    reheatingNotes: recipe.reheatingNotes ?? "",
    tags: recipe.tags.join(", "),
    steps:
      recipe.instructions.length > 0
        ? recipe.instructions.map((text) => ({ key: newKey(), text }))
        : [emptyStep()],
    needsReview: recipe.needsReview,
    ingredients: recipe.ingredients.map((row) => ({
      key: row._id,
      ingredientId: row.ingredientId,
      displayName: row.displayName ?? "",
      quantityText: row.quantityText,
      unit: row.unit,
      optional: row.optional,
      preparation: row.preparation ?? "",
      deductionIngredientId: row.deductionIngredientId ?? null,
      deductionNote: row.deductionNote ?? "",
      needsReview: row.needsReview,
    })),
  };
}

const blank = (s: string) => s.trim() === "";

function isBlankRow(row: DraftIngredient): boolean {
  return (
    row.ingredientId === null &&
    blank(row.quantityText) &&
    blank(row.unit) &&
    blank(row.displayName) &&
    blank(row.preparation) &&
    row.deductionIngredientId === null &&
    blank(row.deductionNote)
  );
}

const optionalText = (s: string) => (blank(s) ? undefined : s.trim());

/** Upsert arguments, or the first thing the person needs to fix. */
export function draftToArgs(
  draft: RecipeDraft,
  id?: Id<"recipes">,
): { ok: true; args: UpsertArgs } | { ok: false; error: string } {
  if (blank(draft.name)) return { ok: false, error: "Give the recipe a name." };

  const ingredients: UpsertArgs["ingredients"] = [];
  for (const [index, row] of draft.ingredients.entries()) {
    if (isBlankRow(row)) continue;
    if (row.ingredientId === null) {
      return { ok: false, error: `Pick an ingredient for line ${index + 1}.` };
    }
    ingredients.push({
      ingredientId: row.ingredientId,
      displayName: optionalText(row.displayName),
      quantityText: row.quantityText.trim(),
      unit: row.unit.trim(),
      optional: row.optional,
      preparation: optionalText(row.preparation),
      deductionIngredientId: row.deductionIngredientId ?? undefined,
      deductionNote: optionalText(row.deductionNote),
      needsReview: row.needsReview,
    });
  }

  const title = optionalText(draft.sourceTitle);
  const url = optionalText(draft.sourceUrl);
  const { type, author, date } = draft.sourceKept;
  // A kept type counts: a recipe saved as { type: "manual" } keeps its source.
  const hasSource = [type, title, url, author, date].some((part) => part !== undefined);

  return {
    ok: true,
    args: {
      id,
      name: draft.name.trim(),
      source: hasSource ? { type: type ?? "manual", title, url, author, date } : undefined,
      yield: blank(draft.yieldText)
        ? undefined
        : { quantityText: draft.yieldText.trim(), unit: draft.yieldUnit.trim() },
      freezerFriendly: draft.freezerFriendly,
      storageNotes: optionalText(draft.storageNotes),
      reheatingNotes: optionalText(draft.reheatingNotes),
      instructions: draft.steps.map((s) => s.text.trim()).filter((s) => s !== ""),
      tags: draft.tags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t !== ""),
      needsReview: draft.needsReview,
      ingredients,
    },
  };
}
