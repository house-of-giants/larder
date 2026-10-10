import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { CheckMarker } from "#/components/recipes/check-marker";
import { shownUnit } from "#/components/recipes/recipe-text";
import { Button } from "#/components/ui/button";
import { RowsSkeleton } from "#/components/page-skeleton";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/_app/recipes/")({
  component: Recipes,
});

function Recipes() {
  const [showArchived, setShowArchived] = useState(false);
  const recipes = useQuery(api.recipes.list, { includeArchived: showArchived });

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
        {recipes?.length !== 0 && <NewRecipeButton />}
      </div>

      <label className="flex min-h-11 items-center gap-3 self-start text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={showArchived}
          onChange={(e) => setShowArchived(e.target.checked)}
        />
        Show archived
      </label>

      {recipes === undefined ? (
        <div aria-busy="true">
          <span className="sr-only">Loading</span>
          <RowsSkeleton rows={4} rowClassName="h-10" />
        </div>
      ) : recipes.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed px-4 py-8">
          <p className="text-muted-foreground">No recipes yet.</p>
          <NewRecipeButton />
        </div>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {recipes.map((r) => {
            return (
              <li key={r._id}>
                <Link
                  to="/recipes/$recipeId"
                  params={{ recipeId: r._id }}
                  className={cn(
                    "flex flex-col gap-1.5 px-4 py-3 hover:bg-accent/40",
                    r.archivedAt !== undefined && "text-muted-foreground",
                  )}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{r.name}</span>
                    {r.archivedAt !== undefined ? (
                      <span className="shrink-0 text-xs">Archived</span>
                    ) : (
                      r.needsReview && <CheckMarker />
                    )}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {r.yield && (
                      <>
                        <span className="tabular">{r.yield.quantityText}</span>
                        {shownUnit(r.yield.unit) && ` ${shownUnit(r.yield.unit)}`}
                        {" · "}
                      </>
                    )}
                    <span className="tabular">{r.ingredientCount}</span>{" "}
                    {r.ingredientCount === 1 ? "ingredient" : "ingredients"}
                  </span>
                  {r.tags.length > 0 && (
                    <span className="flex flex-wrap gap-1.5">
                      {r.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function NewRecipeButton() {
  return (
    <Button asChild>
      <Link to="/recipes/new">
        <Plus aria-hidden />
        New recipe
      </Link>
    </Button>
  );
}
