import { Skeleton } from "#/components/ui/skeleton";

/** Stand-in while the household loads. */
export function PageSkeleton() {
  return (
    <main aria-busy="true" className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-64" />
      <Skeleton className="h-24 w-full" />
    </main>
  );
}
