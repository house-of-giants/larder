import { createFileRoute } from "@tanstack/react-router";
import { emptyDraft } from "#/components/recipes/recipe-draft";
import { RecipeEditor } from "#/components/recipes/recipe-editor";

export const Route = createFileRoute("/_app/recipes/new")({
  component: NewRecipe,
});

function NewRecipe() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-5 pt-3">
      <h1 className="font-display text-display">New recipe</h1>
      <RecipeEditor initial={emptyDraft()} />
    </main>
  );
}
