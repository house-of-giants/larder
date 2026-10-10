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

/** This week: title and status, the action buttons, a card per recipe. */
export function WeekSkeleton() {
  return (
    <Frame>
      <Title line />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>
      <Cards count={3} className="h-[4.25rem]" />
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

/** Store mode: the header with the count, the section chips, rows. */
export function StoreSkeleton() {
  return (
    <Frame className="gap-4 pb-8">
      <div className="flex flex-col gap-1">
        <div className="flex h-9 items-center justify-between gap-3">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex h-14 items-center gap-2 overflow-hidden">
        {["w-12", "w-20", "w-16", "w-24"].map((width) => (
          <Skeleton key={width} className={cn("h-10 shrink-0 rounded-full", width)} />
        ))}
      </div>
      <Skeleton className="h-4 w-20" />
      <RowsSkeleton rows={5} />
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
