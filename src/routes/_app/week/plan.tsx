import { Link, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Plus, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { AisleHeading } from "#/components/kit/aisle-heading";
import { Pill } from "#/components/kit/pill";
import { PlanSkeleton } from "#/components/page-skeleton";
import type { IngredientOption } from "#/components/recipes/recipe-text";
import { AdaptationSheet } from "#/components/week/adaptation-sheet";
import {
  type Adaptation,
  type CurrentWeek,
  type WeekRecipeStatus,
  adaptationText,
} from "#/components/week/labels";
import { MultiplierField } from "#/components/week/multiplier-field";
import { errorMessage } from "#/lib/errors";
import { cn } from "#/lib/utils";
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
      <main className="mx-auto flex max-w-2xl flex-col items-start px-5 pt-3">
        <h1 className="font-display text-display">Plan the week</h1>
        <p className="mt-1 text-caption text-muted-foreground">
          {week === null ? "No week started." : "The plan is set for this week."}
        </p>
        <Pill variant="text" asChild className="-ml-3 px-3">
          <Link to="/week">Back to the week</Link>
        </Pill>
      </main>
    );
  }

  const inWeek = new Set(week.recipes.map((r) => r.recipeId));
  const others = recipes.filter((r) => !inWeek.has(r._id));
  const group = (status: WeekRecipeStatus) => week.recipes.filter((r) => r.status === status);

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-5 pt-3 pb-6">
      <h1 className="font-display text-display">Plan the week</h1>
      <p className="mt-1 text-caption text-muted-foreground">
        {weekOfLabel(week.weekOf)}
        {week.status === "shopping" &&
          ". The list is made. Changes here show up when you make it again."}
      </p>

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
              <Link
                to="/recipes/new"
                className="rounded-sm text-accent-foreground underline underline-offset-[3px] outline-none focus-ring"
              >
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

/** A heading in the serif with its count, then rows with hairlines; no box around them. */
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
    <section aria-labelledby={headingId} className="flex flex-col">
      <AisleHeading
        id={headingId}
        title={title}
        count={children.length === 0 ? undefined : children.length}
        countLabel=""
      />
      {children.length === 0 ? (
        <p className="pt-1 pb-2 text-caption text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col">{children}</ul>
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
    <div className="-mx-3 flex shrink-0">
      {moves
        .filter((m) => m.status !== status)
        .map((m) => (
          <Pill
            key={m.status}
            type="button"
            variant="text"
            className="px-3"
            onClick={() => void setStatus(m.status)}
          >
            {m.label}
          </Pill>
        ))}
    </div>
  );
}

const rowClass = "flex flex-col border-b border-border py-1.5 last:border-b-0";

/** The name, then the moves beside it, or under it when the name needs the width. */
function NameAndMoves({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3">
      <span className="min-w-0 flex-[1_1_14rem] pt-2.5 pb-1 text-body">{name}</span>
      {children}
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
    <li className={rowClass}>
      <NameAndMoves name={name}>
        <Moves weekId={weekId} recipeId={recipeId} status={status} />
      </NameAndMoves>
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
    <li className={cn(rowClass, "pb-2")}>
      <NameAndMoves name={recipe.name}>
        <Moves weekId={week._id} recipeId={recipe.recipeId} status="selected" />
      </NameAndMoves>
      <MultiplierField weekId={week._id} recipeId={recipe.recipeId} text={recipe.multiplier.text} />
      {adaptations.length > 0 && (
        <ul className="mt-1 flex flex-col">
          {adaptations.map((a) => (
            <li key={a._id} className="flex items-start gap-2 text-caption">
              {/* The text's first line sits on the X's centre line. */}
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-[13px]">
                <span>{adaptationText(a)}</span>
                {a.description && <span className="text-muted-foreground">{a.description}</span>}
              </span>
              <button
                type="button"
                aria-label={`Remove: ${adaptationText(a)}`}
                onClick={() => void remove(a._id)}
                className="-mr-3 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-ring"
              >
                <X aria-hidden className="size-[18px]" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Pill
        type="button"
        variant="text"
        className="-ml-3 gap-1.5 self-start px-3"
        onClick={() => setSheetOpen(true)}
      >
        <Plus aria-hidden className="size-4" />
        Change for this week
      </Pill>
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
