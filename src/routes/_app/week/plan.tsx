import { Link, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Plus, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PlanSkeleton } from "#/components/page-skeleton";
import type { IngredientOption } from "#/components/recipes/recipe-text";
import { Button } from "#/components/ui/button";
import { AdaptationSheet } from "#/components/week/adaptation-sheet";
import {
  type Adaptation,
  type CurrentWeek,
  type WeekRecipeStatus,
  adaptationText,
} from "#/components/week/labels";
import { MultiplierField } from "#/components/week/multiplier-field";
import { errorMessage } from "#/lib/errors";
import { weekOfLabel } from "#/lib/week-dates";

export const Route = createFileRoute("/_app/week/plan")({
  component: Plan,
});

function Plan() {
  const { isAuthenticated } = useConvexAuth();
  const week = useQuery(api.weeks.current, isAuthenticated ? {} : "skip");
  const recipes = useQuery(api.recipes.list, isAuthenticated ? {} : "skip");
  const ingredients = useQuery(api.ingredients.list, isAuthenticated ? {} : "skip");

  if (week === undefined || recipes === undefined || ingredients === undefined) {
    return <PlanSkeleton />;
  }

  if (week === null || (week.status !== "planning" && week.status !== "shopping")) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Plan the week</h1>
        <p className="text-muted-foreground">
          {week === null ? "No week started." : "The plan is set for this week."}
        </p>
        <Button asChild variant="outline">
          <Link to="/week">Back to the week</Link>
        </Button>
      </main>
    );
  }

  const inWeek = new Set(week.recipes.map((r) => r.recipeId));
  const others = recipes.filter((r) => !inWeek.has(r._id));
  const group = (status: WeekRecipeStatus) => week.recipes.filter((r) => r.status === status);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Plan the week</h1>
        <p className="text-sm text-muted-foreground">{weekOfLabel(week.weekOf)}</p>
      </div>
      {week.status === "shopping" && (
        <p className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
          The list is made. Changes here show up when you make it again.
        </p>
      )}

      <Group
        title="Selected"
        empty={
          others.length > 0 || group("candidate").length > 0
            ? "Nothing picked yet. Pick from the recipes below."
            : "Nothing picked yet."
        }
      >
        {group("selected").map((r) => (
          <SelectedRecipe
            key={r.weekRecipeId}
            week={week}
            recipe={r}
            adaptations={week.adaptations.filter((a) => a.recipeId === r.recipeId)}
            ingredients={ingredients}
          />
        ))}
      </Group>
      <Group title="Candidates" empty="No candidates.">
        {group("candidate").map((r) => (
          <RecipeRow
            key={r.weekRecipeId}
            weekId={week._id}
            recipeId={r.recipeId}
            name={r.name}
            status="candidate"
          />
        ))}
      </Group>
      <Group title="Skipped" empty="Nothing skipped.">
        {group("skipped").map((r) => (
          <RecipeRow
            key={r.weekRecipeId}
            weekId={week._id}
            recipeId={r.recipeId}
            name={r.name}
            status="skipped"
          />
        ))}
      </Group>
      <Group
        title="All recipes"
        empty={
          recipes.length === 0 ? (
            <>
              No recipes yet.{" "}
              <Link to="/recipes/new" className="text-primary underline-offset-4 hover:underline">
                Add one
              </Link>
            </>
          ) : (
            "Every recipe is in this week."
          )
        }
      >
        {others.map((r) => (
          <RecipeRow key={r._id} weekId={week._id} recipeId={r._id} name={r.name} />
        ))}
      </Group>
    </main>
  );
}

function Group({
  title,
  empty,
  children,
}: {
  title: string;
  empty: ReactNode;
  children: ReactNode[];
}) {
  const headingId = `plan-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2
        id={headingId}
        className="flex items-baseline justify-between text-sm font-medium text-muted-foreground"
      >
        {title}
        <span className="num">{children.length}</span>
      </h2>
      {children.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">{children}</ul>
      )}
    </section>
  );
}

const moves: { status: WeekRecipeStatus; label: string }[] = [
  { status: "selected", label: "Pick" },
  { status: "candidate", label: "Maybe" },
  { status: "skipped", label: "Skip" },
];

function useSetStatus(weekId: Id<"weeks">, recipeId: Id<"recipes">) {
  const setRecipe = useMutation(api.weeks.setRecipe);
  return async (status: WeekRecipeStatus) => {
    try {
      await setRecipe({ weekId, recipeId, status });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
}

/** One-tap moves to every status the recipe is not in. */
function Moves({
  weekId,
  recipeId,
  status,
}: {
  weekId: Id<"weeks">;
  recipeId: Id<"recipes">;
  status?: WeekRecipeStatus;
}) {
  const setStatus = useSetStatus(weekId, recipeId);
  return (
    <div className="flex shrink-0 gap-1.5">
      {moves
        .filter((m) => m.status !== status)
        .map((m) => (
          <Button
            key={m.status}
            type="button"
            variant={m.status === "selected" ? "default" : "outline"}
            size="sm"
            className="h-10 min-w-14"
            onClick={() => void setStatus(m.status)}
          >
            {m.label}
          </Button>
        ))}
    </div>
  );
}

function RecipeRow({
  weekId,
  recipeId,
  name,
  status,
}: {
  weekId: Id<"weeks">;
  recipeId: Id<"recipes">;
  name: string;
  status?: WeekRecipeStatus;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="min-w-0">{name}</span>
      <Moves weekId={weekId} recipeId={recipeId} status={status} />
    </li>
  );
}

function SelectedRecipe({
  week,
  recipe,
  adaptations,
  ingredients,
}: {
  week: CurrentWeek;
  recipe: CurrentWeek["recipes"][number];
  adaptations: Adaptation[];
  ingredients: readonly IngredientOption[];
}) {
  const removeAdaptation = useMutation(api.weeks.removeAdaptation);
  const [sheetOpen, setSheetOpen] = useState(false);

  async function remove(adaptationId: Id<"weekAdaptations">) {
    try {
      await removeAdaptation({ adaptationId });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 font-medium">{recipe.name}</span>
        <Moves weekId={week._id} recipeId={recipe.recipeId} status="selected" />
      </div>
      <MultiplierField weekId={week._id} recipeId={recipe.recipeId} text={recipe.multiplier.text} />
      {adaptations.length > 0 && (
        <ul className="flex flex-col gap-1">
          {adaptations.map((a) => (
            <li key={a._id} className="flex items-start justify-between gap-2 text-sm">
              <span className="flex min-w-0 flex-col gap-0.5 pt-2">
                <span>{adaptationText(a)}</span>
                {a.description && <span className="text-muted-foreground">{a.description}</span>}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={`Remove: ${adaptationText(a)}`}
                onClick={() => void remove(a._id)}
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-10 self-start"
        onClick={() => setSheetOpen(true)}
      >
        <Plus aria-hidden />
        Change for this week
      </Button>
      <AdaptationSheet
        weekId={week._id}
        recipeId={recipe.recipeId}
        recipeName={recipe.name}
        ingredients={ingredients}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </li>
  );
}
