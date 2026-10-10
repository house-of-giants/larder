import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { FormSkeleton } from "#/components/page-skeleton";
import { draftFromRecipe } from "#/components/recipes/recipe-draft";
import { RecipeEditor } from "#/components/recipes/recipe-editor";
import { RecipeNotHere } from "#/components/recipes/recipe-not-here";

export const Route = createFileRoute("/_app/recipes/$recipeId/edit")({
  component: EditRecipe,
});

function EditRecipe() {
  const { recipeId } = Route.useParams();
  const recipe = useQuery(api.recipes.get, { id: recipeId });

  if (recipe === undefined) return <FormSkeleton fields={5} />;
  if (recipe === null) return <RecipeNotHere />;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-5 pt-3">
      <h1 className="font-display text-display">Edit recipe</h1>
      {/* The draft is taken once; edits made elsewhere while this is open do not overwrite it. */}
      <RecipeEditor key={recipe._id} initial={draftFromRecipe(recipe)} recipeId={recipe._id} />
    </main>
  );
}
