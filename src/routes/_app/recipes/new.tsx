import { createFileRoute } from "@tanstack/react-router";
import { emptyDraft } from "#/components/recipes/recipe-draft";
import { RecipeEditor } from "#/components/recipes/recipe-editor";

export const Route = createFileRoute("/_app/recipes/new")({
  component: NewRecipe,
});

function NewRecipe() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">New recipe</h1>
      <RecipeEditor initial={emptyDraft()} />
    </main>
  );
}
