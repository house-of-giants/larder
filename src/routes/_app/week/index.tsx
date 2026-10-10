import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { BookOpen, ChevronRight, CookingPot, Soup } from "lucide-react";
import { type ReactNode, useState } from "react";
import { api } from "../../../../convex/_generated/api";
import { MadeItSheet } from "#/components/cook/made-it-sheet";
import { AisleHeading } from "#/components/kit/aisle-heading";
import { Pill } from "#/components/kit/pill";
import { WeekSkeleton } from "#/components/page-skeleton";
import {
  type CurrentWeek,
  type WeekRecipe,
  adaptationShort,
  fridgeCount,
  fridgeLine,
  weekStatusLabels,
} from "#/components/week/labels";
import { madeLabel, madeWhen, onHandText, tonightOf, yieldOf } from "#/components/week/tonight";
import { errorMessage } from "#/lib/errors";
import { localIsoDate, weekOfLabel } from "#/lib/week-dates";

export const Route = createFileRoute("/_app/week/")({
  component: Week,
});

type Cook = FunctionReturnType<typeof api.cooking.forWeek>[number];

function Week() {
  const { isAuthenticated } = useConvexAuth();
  const week = useQuery(api.weeks.current, isAuthenticated ? {} : "skip");
  const fridge = useQuery(api.leftovers.list, isAuthenticated ? {} : "skip");
  const cooks = useQuery(
    api.cooking.forWeek,
    isAuthenticated && week ? { weekId: week._id } : "skip",
  );

  if (week === undefined || (week !== null && cooks === undefined)) return <WeekSkeleton />;
  if (week === null) return <NoWeek />;
  return <ThisWeek week={week} cooks={cooks ?? []} fridgeCount={fridgeCount(fridge)} />;
}

function NoWeek() {
  const create = useMutation(api.weeks.create);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    try {
      await create({ weekOf: localIsoDate(new Date()) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-5 pt-3">
      <h1 className="font-display text-display">This week</h1>
      <p className="mt-1 text-caption text-muted-foreground">No week started.</p>
      <BottomBar error={error}>
        <Pill onClick={start} disabled={pending} className="min-w-50">
          Start a week
        </Pill>
      </BottomBar>
    </main>
  );
}

function ThisWeek({
  week,
  cooks,
  fridgeCount,
}: {
  week: CurrentWeek;
  cooks: Cook[];
  /** Undefined while the leftovers load; the caption leaves the fridge out until then. */
  fridgeCount: number | undefined;
}) {
  const generate = useMutation(api.lists.generate);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One Made it sheet for the screen, so it stays open on its summary while the recipe it
  // made moves from Tonight into the rows.
  const [cooking, setCooking] = useState<WeekRecipe | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const madeIt = (recipe: WeekRecipe) => {
    setCooking(recipe);
    setSheetOpen(true);
  };

  const selected = week.recipes.filter((r) => r.status === "selected");
  const madeAt = new Map(cooks.map((c) => [c.recipeId, c]));
  const tonight = tonightOf(week.recipes, cooks);
  const rest = selected.filter((r) => r !== tonight);
  const { status } = week;
  const shopping = status === "shopping";
  const lateWeek = status === "cooking" || status === "active";

  async function makeList() {
    setPending(true);
    setError(null);
    try {
      await generate({ weekId: week._id });
      await navigate({ to: "/list/reconcile" });
    } catch (e) {
      setError(errorMessage(e));
      setPending(false);
    }
  }

  // The screen's one tomato control (DESIGN.md, the One Tomato Rule): the next step.
  let primary: ReactNode = null;
  if (status === "planning" && selected.length > 0) {
    primary = (
      <Pill onClick={makeList} disabled={pending} className="min-w-50">
        Make the list
      </Pill>
    );
  } else if (shopping || (lateWeek && cooks.length === 0)) {
    primary = (
      <Pill asChild className="min-w-50">
        <Link to="/list">Open the list</Link>
      </Pill>
    );
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-5 pt-3">
      <h1 className="font-display text-display">{weekOfLabel(week.weekOf)}</h1>
      <p className="mt-1 text-caption text-muted-foreground">
        <span>
          <span className="tabular">{selected.length}</span>{" "}
          {selected.length === 1 ? "recipe" : "recipes"}
        </span>
        {` · ${weekStatusLabels[status].toLowerCase()}`}
        {fridgeCount !== undefined && (
          <>
            {" · "}
            <Link
              to="/leftovers"
              className="relative rounded-sm underline decoration-ring-quiet underline-offset-[3px] outline-none hover:text-foreground focus-ring after:absolute after:-inset-x-1 after:-inset-y-3.5"
            >
              <span className="tabular">{fridgeLine(fridgeCount)}</span>
            </Link>
          </>
        )}
      </p>

      {/* Secondary actions: text in tomato ink, never a row of buttons. */}
      {(status === "planning" || shopping) && (
        <div className="-ml-3 flex">
          <Pill variant="text" asChild className="px-3">
            <Link to="/week/plan">Plan the week</Link>
          </Pill>
          {shopping && (
            <Pill
              variant="text"
              className="px-3"
              onClick={makeList}
              disabled={pending || selected.length === 0}
            >
              Make the list again
            </Pill>
          )}
        </div>
      )}

      {selected.length === 0 ? (
        <p className="pt-3 text-muted-foreground">No recipes picked yet.</p>
      ) : tonight ? (
        <TonightCard
          recipe={tonight}
          onMadeIt={() => madeIt(tonight)}
          adaptations={week.adaptations.filter((a) => a.recipeId === tonight.recipeId)}
        />
      ) : (
        <AllMade cooks={cooks} />
      )}

      {rest.length > 0 && (
        <section aria-labelledby="this-week" className="mt-2 flex flex-col">
          <AisleHeading
            id="this-week"
            title="This week"
            count={rest.length}
            countLabel={tonight ? "more" : rest.length === 1 ? "recipe" : "recipes"}
          />
          <ul className="flex flex-col">
            {rest.map((r) => (
              <WeekRow key={r.weekRecipeId} recipe={r} made={madeAt.get(r.recipeId)} />
            ))}
          </ul>
        </section>
      )}

      {status !== "planning" && (
        <Pill variant="text" asChild className="mt-2 -ml-3 self-start px-3">
          <Link to="/closeout">Close the week</Link>
        </Pill>
      )}

      {(primary || error) && <BottomBar error={error}>{primary}</BottomBar>}

      {cooking && (
        <MadeItSheet
          key={cooking.recipeId}
          recipeId={cooking.recipeId}
          recipeName={cooking.name}
          weekId={week._id}
          defaultMultiplier={cooking.multiplier.text}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
        />
      )}
    </main>
  );
}

/**
 * The one card on the screen (DESIGN.md, Cards): tonight's recipe in the serif, one meta
 * line that opens with "Tonight" and the yield in tomato, the pale Made it, and a round
 * button to the recipe.
 */
function TonightCard({
  recipe,
  adaptations,
  onMadeIt,
}: {
  recipe: WeekRecipe;
  adaptations: CurrentWeek["adaptations"];
  onMadeIt: () => void;
}) {
  const made = yieldOf(recipe);
  const onHand = onHandText(recipe);
  const meta = [...adaptations.map(adaptationShort), ...(onHand ? [onHand] : [])];
  return (
    <section
      aria-label="Tonight"
      className="mt-2 rounded-lg border border-border bg-card px-4 pt-3.5 pb-4"
    >
      <h2 className="font-display text-title">{recipe.name}</h2>
      <p className="mt-1.5 text-caption text-muted-foreground">
        <Soup aria-hidden className="mr-1.5 inline size-4 -translate-y-px text-primary" />
        Tonight
        {made && (
          <>
            {" · "}
            <span className="font-semibold text-primary">
              <span className="tabular">{made.figure}</span>
              {made.unit && ` ${made.unit}`}
            </span>
          </>
        )}
        {meta.map((part) => (
          <span key={part} className="tabular">
            {` · ${part}`}
          </span>
        ))}
      </p>
      <div className="mt-3 flex items-center gap-3">
        <Pill type="button" variant="pale" onClick={onMadeIt}>
          <CookingPot aria-hidden className="size-[18px]" />
          Made it
        </Pill>
        <Link
          to="/recipes/$recipeId"
          params={{ recipeId: recipe.recipeId }}
          aria-label={`Open ${recipe.name}`}
          className="flex size-11 items-center justify-center rounded-full border border-border text-muted-foreground outline-none hover:text-foreground focus-ring"
        >
          <BookOpen aria-hidden className="size-5" strokeWidth={1.8} />
        </Link>
      </div>
    </section>
  );
}

/** Every selected recipe is made: the card says so, with the last cook's time. */
function AllMade({ cooks }: { cooks: Cook[] }) {
  const last = Math.max(...cooks.map((c) => c.cookedAt));
  return (
    <section
      aria-label="Tonight"
      className="mt-3 rounded-lg border border-border bg-card px-4 pt-3.5 pb-4"
    >
      <h2 className="font-display text-title">All made</h2>
      <p className="mt-1.5 text-caption text-muted-foreground">
        <span className="tabular">Last one {madeWhen(last)}</span>
      </p>
    </section>
  );
}

/**
 * A recipe in the week: the yield as a serif numeral with its unit under it, level with the
 * name, then what is on hand or when it was made. The whole row opens the recipe, where
 * Made it lives; on this screen only Tonight carries it, so the rows hold no verbs.
 */
function WeekRow({ recipe, made }: { recipe: WeekRecipe; made: Cook | undefined }) {
  const makes = yieldOf(recipe);
  const second = made ? madeLabel(made.cookedAt, made.times) : onHandText(recipe);
  return (
    <li className="relative flex min-h-15 items-start gap-3 border-b border-border py-2.5 last:border-b-0">
      <span className="flex w-14 shrink-0 flex-col items-end">
        {makes && (
          <>
            {/* Its first line sits level with the name's (17px at 1.3). */}
            <span className="pt-px font-display text-title leading-none text-primary">
              {makes.figure}
            </span>
            {makes.unit && (
              <span className="mt-0.5 max-w-full truncate text-label text-muted-foreground">
                {makes.unit}
              </span>
            )}
          </>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <Link
          to="/recipes/$recipeId"
          params={{ recipeId: recipe.recipeId }}
          className="rounded-sm text-body outline-none focus-ring after:absolute after:inset-0"
        >
          {recipe.name}
        </Link>
        {second && (
          <span className="mt-0.5 text-caption text-muted-foreground">
            <span className="tabular">{second}</span>
          </span>
        )}
      </span>
      <ChevronRight aria-hidden className="size-[18px] shrink-0 self-center text-ring-quiet" />
    </li>
  );
}

/** In thumb reach above the tab bar, on a paper fade, wherever the week is scrolled. */
function BottomBar({ error, children }: { error: string | null; children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(4rem+1px+env(safe-area-inset-bottom))] z-10 -mx-5 mt-auto flex flex-col items-center gap-2 bg-linear-to-b from-transparent to-background to-40% px-5 pt-9 pb-3">
      {children}
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
