import type { ReactNode } from "react";
import { Skeleton } from "#/components/ui/skeleton";
import { cn } from "#/lib/utils";

// Stand-ins shaped like the screens they precede, so nothing jumps when data arrives.

function Frame({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <main
      aria-busy="true"
      className={cn("mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6", className)}
    >
      <span className="sr-only">Loading</span>
      {children}
    </main>
  );
}

/** A page title, with a button beside it when the screen has one. */
function Title({ action = false, line = false }: { action?: boolean; line?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-9 items-center justify-between gap-4">
        <Skeleton className="h-7 w-40" />
        {action && <Skeleton className="h-9 w-32" />}
      </div>
      {line && <Skeleton className="h-4 w-56" />}
    </div>
  );
}

/** A bordered run of rows, the shape of the pantry, the plan, and the recipe list. */
export function RowsSkeleton({
  rows = 4,
  rowClassName = "h-6",
}: {
  rows?: number;
  rowClassName?: string;
}) {
  return (
    <div className="flex flex-col divide-y rounded-lg border bg-card">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex min-h-14 items-center justify-between gap-4 px-4">
          <Skeleton className={cn("w-2/5", rowClassName)} />
          <Skeleton className="h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

function Cards({ count, className }: { count: number; className: string }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={cn("w-full rounded-lg", className)} />
      ))}
    </div>
  );
}

/** Generic: a title, a line, a block. For the household loading behind the tabs. */
export function PageSkeleton() {
  return (
    <Frame className="gap-4">
      <Title line />
      <Skeleton className="h-24 w-full" />
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
        <div key={rows} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
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

/** Before you shop: rows with an editor under each name. */
export function ReconcileSkeleton() {
  return (
    <Frame>
      <Title line />
      <Skeleton className="h-4 w-24" />
      <RowsSkeleton rows={4} rowClassName="h-10" />
    </Frame>
  );
}

/** Pantry: title with Add, the search field, a location of rows. */
export function PantrySkeleton() {
  return (
    <Frame>
      <Title action />
      <Skeleton className="h-9 w-full" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <RowsSkeleton rows={5} />
      </div>
    </Frame>
  );
}

/** Leftovers: one tall card per thing in the fridge. */
export function LeftoversSkeleton() {
  return (
    <Frame>
      <Title />
      <Cards count={2} className="h-40" />
    </Frame>
  );
}

/** Close the week: a card per leftover with its three-way choice, then the button. */
export function CloseoutSkeleton() {
  return (
    <Frame>
      <Title line />
      <Cards count={2} className="h-28" />
      <Skeleton className="h-12 w-full" />
    </Frame>
  );
}

/** One recipe: title, buttons, ingredient rows, steps. */
export function RecipeSkeleton() {
  return (
    <Frame>
      <Title line />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-16" />
        <Skeleton className="h-9 w-20" />
      </div>
      <RowsSkeleton rows={5} rowClassName="h-5" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </Frame>
  );
}

/** A form of labeled fields: recipe editing, settings. */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <Frame>
      <Title />
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </Frame>
  );
}
