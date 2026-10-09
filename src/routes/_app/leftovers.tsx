import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { LeftoverCard } from "#/components/leftovers/leftover-card";
import { PageSkeleton } from "#/components/page-skeleton";

export const Route = createFileRoute("/_app/leftovers")({
  component: Leftovers,
});

function Leftovers() {
  const { isAuthenticated } = useConvexAuth();
  const foods = useQuery(api.leftovers.list, isAuthenticated ? {} : "skip");
  // Read once when the screen opens; "made today" only needs the day.
  const [now] = useState(() => Date.now());

  if (foods === undefined) return <PageSkeleton />;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Leftovers</h1>
      {foods.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-8 text-muted-foreground">
          Nothing cooked yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {foods.map((food) => (
            <LeftoverCard key={food._id} food={food} now={now} />
          ))}
        </ul>
      )}
    </main>
  );
}
