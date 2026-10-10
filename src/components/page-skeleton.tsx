import type { ReactNode } from "react";
import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";

// Stand-ins shaped like the screens they precede, so nothing jumps when data arrives.

function Frame({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <main
      aria-busy="true"
      className={cn("mx-auto flex max-w-2xl flex-col gap-4 px-5 pt-3 pb-24", className)}
    >
      <span className="sr-only">Loading</span>
      {children}
    </main>
  );
}

/** The serif screen title, and the quiet line under it when the screen has one. */
function Title({ line = false }: { line?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Skeleton className="h-9 w-44" />
      {line && <Skeleton className="h-4 w-52" />}
    </div>
  );
}

/**
 * Rows on the page with a hairline under each, the shape of the pantry, the recipes, the
 * plan and reconcile: a name, and the quiet second line under it.
 */
export function RowsSkeleton({
  rows = 4,
  rowClassName = "h-5",
}: {
  rows?: number;
  rowClassName?: string;
}) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex min-h-14 flex-col justify-center gap-1.5 border-b border-border py-1.5 last:border-b-0"
        >
          <Skeleton className={cn("w-3/5", rowClassName)} />
          <Skeleton className="h-3.5 w-24" />
        </div>
      ))}
    </div>
  );
}

/** A serif heading over rows: an aisle, a place in the pantry, a section of a recipe. */
function Heading() {
  return <Skeleton className="mt-2 h-6 w-28" />;
}

/** Generic: a title, a line, a block. For the household loading behind the tabs. */
export function PageSkeleton() {
  return (
    <Frame>
      <Title line />
      <RowsSkeleton rows={3} />
    </Frame>
  );
}

/** This week: the title and its line, the Tonight card, the week's rows. */
export function WeekSkeleton() {
  return (
    <Frame className="gap-0 px-5 pt-3">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-1.5 h-4 w-56" />
      <Skeleton className="mt-4 h-5 w-28" />
      <Skeleton className="mt-4 h-40 w-full rounded-lg" />
      <Skeleton className="mt-6 h-6 w-32" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex min-h-15 items-center gap-3 border-b border-border py-2.5">
          <Skeleton className="h-8 w-14" />
          <Skeleton className="h-5 flex-1" />
        </div>
      ))}
    </Frame>
  );
}

/** Plan the week: groups of recipe rows. */
export function PlanSkeleton() {
  return (
    <Frame>
      <Title line />
      {[2, 3].map((rows) => (
        <div key={rows} className="flex flex-col">
          <Heading />
          <RowsSkeleton rows={rows} />
        </div>
      ))}
    </Frame>
  );
}

/** Store mode: the title, the progress line, the section chips, an aisle of rows. */
export function StoreSkeleton() {
  return (
    <Frame className="gap-0 px-5 pt-3 pb-24">
      <Skeleton className="h-9 w-28" />
      <Skeleton className="mt-1.5 h-4 w-44" />
      <div className="flex h-16 items-center gap-2.5 overflow-hidden">
        {["w-12", "w-20", "w-28", "w-24"].map((width) => (
          <Skeleton key={width} className={cn("h-11 shrink-0 rounded-sm", width)} />
        ))}
      </div>
      <Skeleton className="mt-4 h-6 w-32" />
      <div className="mt-2 flex flex-col">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex min-h-14 items-center gap-3 border-b border-border">
            <Skeleton className="size-[22px] shrink-0 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** Before you shop: rows with an editor beside each name. */
export function ReconcileSkeleton() {
  return (
    <Frame>
      <Title line />
      <RowsSkeleton rows={5} />
    </Frame>
  );
}

/** Pantry: the title and its count line, the search field, a place of rows. */
export function PantrySkeleton() {
  return (
    <Frame className="gap-0">
      <Title line />
      <Skeleton className="mt-3 h-11 w-full rounded-md" />
      <Heading />
      <div className="mt-2">
        <RowsSkeleton rows={6} />
      </div>
    </Frame>
  );
}

/** Recipes: the title and its count line, then the recipe rows. */
export function RecipesSkeleton() {
  return (
    <Frame className="gap-2">
      <Title line />
      <RowsSkeleton rows={6} />
    </Frame>
  );
}

/** Leftovers: a row per thing in the fridge, its count and its text actions under it. */
export function LeftoversSkeleton() {
  return (
    <Frame className="gap-2">
      <Title line />
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-border py-3">
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="h-5 w-28" />
          <div className="flex gap-3">
            <Skeleton className="h-11 w-24 rounded-full" />
            <Skeleton className="h-11 w-16 rounded-full" />
            <Skeleton className="h-11 w-28 rounded-full" />
          </div>
        </div>
      ))}
    </Frame>
  );
}

/** Close the week: a row per leftover with its three chips, then the pill. */
export function CloseoutSkeleton() {
  return (
    <Frame className="gap-2">
      <Title line />
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2 border-b border-border py-3">
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-3.5 w-36" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-20 rounded-sm" />
            <Skeleton className="h-8 w-20 rounded-sm" />
            <Skeleton className="h-8 w-16 rounded-sm" />
          </div>
        </div>
      ))}
      <Skeleton className="mt-6 h-11 w-50 self-center rounded-full" />
    </Frame>
  );
}

/** One recipe: the serif name, Makes, the pill and its text actions, ingredients, steps. */
export function RecipeSkeleton() {
  return (
    <Frame className="gap-0">
      <Skeleton className="h-9 w-4/5" />
      <Skeleton className="mt-2 h-4 w-36" />
      <Skeleton className="mt-1.5 h-3.5 w-52" />
      <div className="mt-4 flex gap-3">
        <Skeleton className="h-11 w-28 rounded-full" />
        <Skeleton className="h-11 w-14 rounded-full" />
        <Skeleton className="h-11 w-20 rounded-full" />
      </div>
      <Skeleton className="mt-6 mb-1 h-6 w-32" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex min-h-11 items-center border-b border-border">
          <Skeleton className="h-4 w-3/5" />
        </div>
      ))}
    </Frame>
  );
}

/** A form of labeled fields: recipe editing, settings. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <Frame>
      <Title />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-11 w-full rounded-md" />
        </div>
      ))}
    </Frame>
  );
}
