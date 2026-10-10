import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../../convex/_generated/api";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { MadeItButton } from "#/components/cook/made-it-button";
import { Amount } from "#/components/kit/amount";
import { Pill } from "#/components/kit/pill";
import { RecipeSkeleton } from "#/components/page-skeleton";
import { CheckMarker } from "#/components/recipes/check-marker";
import { RecipeNotHere } from "#/components/recipes/recipe-not-here";
import {
  ingredientLine,
  safeHref,
  type Recipe,
  type RecipeRow,
} from "#/components/recipes/recipe-text";
import { TagList } from "#/components/recipes/tag-list";
import { errorMessage } from "#/lib/errors";

export const Route = createFileRoute("/_app/recipes/$recipeId/")({
  component: RecipePage,
});

function RecipePage() {
  const { recipeId } = Route.useParams();
  const recipe = useQuery(api.recipes.get, { id: recipeId });

  if (recipe === undefined) return <RecipeSkeleton />;
  if (recipe === null) return <RecipeNotHere />;
  return <RecipeView recipe={recipe} />;
}

function RecipeView({ recipe }: { recipe: Recipe }) {
  const archived = recipe.archivedAt !== undefined;
  const href = safeHref(recipe.source?.url);
  const sourceLabel = recipe.source?.title ?? recipe.source?.url;
  const keeping =
    recipe.freezerFriendly === undefined
      ? null
      : recipe.freezerFriendly
        ? "Freezes well."
        : "Not one for the freezer.";

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-5 pt-3 pb-24">
      <header className="flex flex-col">
        <h1 className="font-display text-display text-balance">{recipe.name}</h1>
        {recipe.yield && (
          <p className="mt-1.5 text-subhead">
            Makes <Amount quantityText={recipe.yield.quantityText} unit={recipe.yield.unit} />
          </p>
        )}
        {(sourceLabel || keeping) && (
          <p className="mt-1 text-caption text-muted-foreground">
            {sourceLabel && (
              <>
                From{" "}
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-sm underline decoration-ring-quiet underline-offset-4 hover:text-foreground focus-ring"
                  >
                    {sourceLabel}
                  </a>
                ) : (
                  sourceLabel
                )}
                {keeping && " · "}
              </>
            )}
            {keeping}
          </p>
        )}
        {recipe.needsReview && !archived && <CheckMarker className="mt-1.5" />}
        {recipe.tags.length > 0 && (
          <div className="mt-2.5">
            <TagList tags={recipe.tags} />
          </div>
        )}
      </header>

      {archived && (
        <p className="mt-4 text-body text-muted-foreground">
          Archived. It stays off the recipe list until you restore it.
        </p>
      )}

      <Actions recipe={recipe} />

      <section className="mt-6 flex flex-col" aria-labelledby="ingredients-heading">
        <h2 id="ingredients-heading" className="pb-1 font-display text-title">
          Ingredients
        </h2>
        {recipe.ingredients.length === 0 ? (
          <p className="pt-1 text-body text-muted-foreground">No ingredients yet.</p>
        ) : (
          <ul className="flex flex-col">
            {recipe.ingredients.map((row) => (
              <IngredientRow key={row._id} row={row} />
            ))}
          </ul>
        )}
      </section>

      {(recipe.storageNotes || recipe.reheatingNotes) && (
        <section className="mt-6 flex flex-col gap-3" aria-labelledby="keeping-heading">
          <h2 id="keeping-heading" className="font-display text-title">
            Keeping
          </h2>
          {recipe.storageNotes && <Note label="Storage" text={recipe.storageNotes} />}
          {recipe.reheatingNotes && <Note label="Reheating" text={recipe.reheatingNotes} />}
        </section>
      )}

      <section className="mt-6 flex flex-col gap-2" aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="font-display text-title">
          Steps
        </h2>
        {recipe.instructions.length === 0 ? (
          <div className="flex flex-col items-start">
            <p className="text-body text-muted-foreground">No steps written down yet.</p>
            <Pill variant="text" asChild className="-ml-5">
              <Link to="/recipes/$recipeId/edit" params={{ recipeId: recipe._id }}>
                Add steps
              </Link>
            </Pill>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {recipe.instructions.map((step, index) => (
              // Steps have no ids; their position is their identity.
              // oxlint-disable-next-line react/no-array-index-key
              <li key={index} className="flex gap-3 text-body">
                <span className="tabular w-6 shrink-0 text-right text-muted-foreground">
                  {index + 1}.
                </span>
                <span className="max-w-[65ch] whitespace-pre-line">{step}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

/** "1/2 cup pecans": the amount first, in tomato, as in the Made it sheet. */
function IngredientRow({ row }: { row: RecipeRow }) {
  const { lead, name, tail } = ingredientLine(row);
  return (
    <li className="flex min-h-11 items-baseline gap-3 border-b border-border py-2.5 text-body last:border-b-0">
      <span className="min-w-0 flex-1">
        {lead && (
          <>
            <Amount quantityText={row.quantityText} unit={row.unit} />{" "}
          </>
        )}
        {name}
        {tail.length > 0 && <span className="text-muted-foreground">, {tail.join(", ")}</span>}
      </span>
      {row.optional && (
        <span className="shrink-0 text-caption text-muted-foreground">optional</span>
      )}
    </li>
  );
}

/**
 * The page's one coloured control is the pale Made it pill; Edit and Archive are text
 * actions beside it. Archived, Restore takes the pale pill's place.
 */
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
    <div className="mt-4 flex flex-wrap items-center gap-x-1 gap-y-2">
      {archived ? (
        <Pill variant="pale" disabled={pending} onClick={bringBack}>
          Restore
        </Pill>
      ) : (
        <MadeItButton recipeId={recipe._id} recipeName={recipe.name} />
      )}
      <Pill variant="text" asChild>
        <Link to="/recipes/$recipeId/edit" params={{ recipeId: recipe._id }}>
          Edit
        </Link>
      </Pill>
      {!archived && (
        <ConfirmDialog
          trigger={<Pill variant="text">Archive</Pill>}
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
    <div className="flex flex-col gap-0.5">
      <h3 className="text-caption text-muted-foreground">{label}</h3>
      <p className="max-w-[65ch] text-body whitespace-pre-line">{text}</p>
    </div>
  );
}
