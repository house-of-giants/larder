import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { PageSkeleton } from "#/components/page-skeleton";
import { draftFromRecipe } from "#/components/recipes/recipe-draft";
import { RecipeEditor } from "#/components/recipes/recipe-editor";
import { RecipeNotHere } from "#/components/recipes/recipe-not-here";

export const Route = createFileRoute("/_app/recipes/$recipeId/edit")({
  component: EditRecipe,
});

function EditRecipe() {
  const { recipeId } = Route.useParams();
  const recipe = useQuery(api.recipes.get, { id: recipeId });

  if (recipe === undefined) return <PageSkeleton />;
  if (recipe === null) return <RecipeNotHere />;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6">
      <h1 className="text-2xl font-semibold tracking-tight">Edit recipe</h1>
      {/* The draft is taken once; edits made elsewhere while this is open do not overwrite it. */}
      <RecipeEditor key={recipe._id} initial={draftFromRecipe(recipe)} recipeId={recipe._id} />
    </main>
  );
}
