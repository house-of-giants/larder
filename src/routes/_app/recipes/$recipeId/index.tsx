import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { PageSkeleton } from "#/components/page-skeleton";
import { CheckMarker } from "#/components/recipes/check-marker";
import { RecipeNotHere } from "#/components/recipes/recipe-not-here";
import {
  amountText,
  ingredientLine,
  safeHref,
  type Recipe,
} from "#/components/recipes/recipe-text";
import { Button } from "#/components/ui/button";
import { errorMessage } from "#/lib/errors";

export const Route = createFileRoute("/_app/recipes/$recipeId/")({
  component: RecipePage,
});

function RecipePage() {
  const { recipeId } = Route.useParams();
  const recipe = useQuery(api.recipes.get, { id: recipeId });

  if (recipe === undefined) return <PageSkeleton />;
  if (recipe === null) return <RecipeNotHere />;
  return <RecipeView recipe={recipe} />;
}

function RecipeView({ recipe }: { recipe: Recipe }) {
  const archived = recipe.archivedAt !== undefined;
  const href = safeHref(recipe.source?.url);
  const sourceLabel = recipe.source?.title ?? recipe.source?.url;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        {recipe.needsReview && !archived && (
          <div>
            <CheckMarker />
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{recipe.name}</h1>
        {recipe.yield && (
          <p className="num text-muted-foreground">
            Makes {amountText(recipe.yield.quantityText, recipe.yield.unit)}
          </p>
        )}
        {sourceLabel && (
          <p className="text-sm text-muted-foreground">
            From{" "}
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                {sourceLabel}
              </a>
            ) : (
              sourceLabel
            )}
          </p>
        )}
        {recipe.freezerFriendly !== undefined && (
          <p className="text-sm text-muted-foreground">
            {recipe.freezerFriendly ? "Freezes well." : "Not one for the freezer."}
          </p>
        )}
        {recipe.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
            {recipe.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}
      </header>

      {archived && (
        <p className="rounded-lg border bg-muted px-4 py-3 text-sm">
          Archived. It stays off the recipe list until you restore it.
        </p>
      )}

      <Actions recipe={recipe} />

      <section className="flex flex-col gap-3" aria-labelledby="ingredients-heading">
        <h2 id="ingredients-heading" className="font-medium">
          Ingredients
        </h2>
        {recipe.ingredients.length === 0 ? (
          <p className="text-muted-foreground">No ingredients yet.</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border bg-card">
            {recipe.ingredients.map((row) => {
              const { lead, name, tail } = ingredientLine(row);
              return (
                <li key={row._id} className="flex items-baseline gap-3 px-4 py-2.5">
                  <span className="num w-20 shrink-0 text-sm">{lead}</span>
                  <span className="flex-1">
                    {name}
                    {tail.length > 0 && (
                      <span className="text-muted-foreground">, {tail.join(", ")}</span>
                    )}
                  </span>
                  {row.optional && (
                    <span className="shrink-0 text-xs text-muted-foreground">optional</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {(recipe.storageNotes || recipe.reheatingNotes) && (
        <section className="flex flex-col gap-3" aria-labelledby="keeping-heading">
          <h2 id="keeping-heading" className="font-medium">
            Keeping
          </h2>
          {recipe.storageNotes && <Note label="Storage" text={recipe.storageNotes} />}
          {recipe.reheatingNotes && <Note label="Reheating" text={recipe.reheatingNotes} />}
        </section>
      )}

      <section className="flex flex-col gap-3" aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="font-medium">
          Steps
        </h2>
        {recipe.instructions.length === 0 ? (
          <p className="text-muted-foreground">No steps written down yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {recipe.instructions.map((step, index) => (
              // Steps have no ids; their position is their identity.
              // oxlint-disable-next-line react/no-array-index-key
              <li key={index} className="flex gap-3">
                <span className="num w-6 shrink-0 text-right text-muted-foreground">
                  {index + 1}.
                </span>
                <span className="whitespace-pre-line">{step}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function Actions({ recipe }: { recipe: Recipe }) {
  const archive = useMutation(api.recipes.archive);
  const restore = useMutation(api.recipes.restore);
  const [pending, setPending] = useState(false);
  const archived = recipe.archivedAt !== undefined;

  async function bringBack() {
    setPending(true);
    try {
      await restore({ id: recipe._id });
      toast("Back on the list");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button asChild>
        <Link to="/recipes/$recipeId/edit" params={{ recipeId: recipe._id }}>
          Edit
        </Link>
      </Button>
      {archived ? (
        <Button type="button" variant="outline" disabled={pending} onClick={bringBack}>
          Restore
        </Button>
      ) : (
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline">
              Archive
            </Button>
          }
          title="Archive this recipe?"
          description="It leaves the recipe list. Nothing is deleted, and Show archived brings it back."
          confirmLabel="Archive"
          onConfirm={async () => {
            await archive({ id: recipe._id });
            toast("Archived");
          }}
        />
      )}
    </div>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm text-muted-foreground">{label}</h3>
      <p className="whitespace-pre-line">{text}</p>
    </div>
  );
}
