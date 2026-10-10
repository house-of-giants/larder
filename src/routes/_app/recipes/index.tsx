import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { Chip } from "#/components/kit/chip";
import { Fab } from "#/components/kit/fab";
import { RecipesSkeleton } from "#/components/page-skeleton";
import { CheckMarker } from "#/components/recipes/check-marker";
import { shownUnit } from "#/components/recipes/recipe-text";
import { TagList } from "#/components/recipes/tag-list";
import { pluralUnit } from "#/lib/units";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/_app/recipes/")({
  component: Recipes,
});

/**
 * The house recipes as rows: the name, a quiet count line, the tags. Show archived appears
 * only when something is archived. New recipe is the floating button.
 */
function Recipes() {
  const [showArchived, setShowArchived] = useState(false);
  const active = useQuery(api.recipes.list, {});
  // A count decides whether the chip shows; the archived recipes load only once it is on.
  const archived = useQuery(api.recipes.archivedCount, {}) ?? 0;
  const withArchived = useQuery(
    api.recipes.list,
    showArchived && archived > 0 ? { includeArchived: true } : "skip",
  );

  if (active === undefined) return <RecipesSkeleton />;

  // While the archived ones load, the active list stays on screen.
  const recipes = showArchived && archived > 0 ? (withArchived ?? active) : active;
  const empty = active.length === 0 && archived === 0;

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-5 pt-3 pb-24">
      <h1 className="font-display text-display">Recipes</h1>
      {empty ? (
        <p className="mt-1 text-body text-muted-foreground">No recipes yet.</p>
      ) : (
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-caption text-muted-foreground">
            <span className="tabular">{active.length}</span>{" "}
            {active.length === 1 ? "recipe" : "recipes"}
          </p>
          {archived > 0 && (
            <Chip selected={showArchived} onClick={() => setShowArchived((on) => !on)}>
              Show archived
            </Chip>
          )}
        </div>
      )}
      {recipes.length > 0 && (
        <ul className="mt-2 flex flex-col">
          {recipes.map((r) => {
            const isArchived = r.archivedAt !== undefined;
            const yieldUnit = r.yield ? shownUnit(r.yield.unit) : "";
            return (
              <li key={r._id} className="border-b border-border last:border-b-0">
                <Link
                  to="/recipes/$recipeId"
                  params={{ recipeId: r._id }}
                  className="flex min-h-14 flex-col gap-1 rounded-md py-2.5 focus-ring"
                >
                  <span className={cn("text-body", isArchived && "text-muted-foreground")}>
                    {r.name}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
                    <span>
                      {r.yield && (
                        <>
                          <span className="tabular">{r.yield.quantityText}</span>
                          {yieldUnit && ` ${pluralUnit(r.yield.quantityText, yieldUnit)}`}
                          {" · "}
                        </>
                      )}
                      <span className="tabular">{r.ingredientCount}</span>{" "}
                      {r.ingredientCount === 1 ? "ingredient" : "ingredients"}
                      {isArchived && " · archived"}
                    </span>
                    {!isArchived && r.needsReview && <CheckMarker />}
                  </span>
                  <TagList tags={r.tags} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Fab asChild label="New recipe">
        <Link to="/recipes/new" />
      </Fab>
    </main>
  );
}
