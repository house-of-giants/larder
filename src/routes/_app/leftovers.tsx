import { Link, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { LeftoverCard } from "#/components/leftovers/leftover-card";
import { LeftoversSkeleton } from "#/components/page-skeleton";
import { Button } from "#/components/ui/button";

export const Route = createFileRoute("/_app/leftovers")({
  component: Leftovers,
});

function Leftovers() {
  const { isAuthenticated } = useConvexAuth();
  const foods = useQuery(api.leftovers.list, isAuthenticated ? {} : "skip");
  // Read once when the screen opens; "made today" only needs the day.
  const [now] = useState(() => Date.now());

  if (foods === undefined) return <LeftoversSkeleton />;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Leftovers</h1>
      {foods.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed px-4 py-8">
          <p className="text-muted-foreground">Nothing left over. Say Made it on a recipe.</p>
          <Button asChild variant="outline">
            <Link to="/week">This week</Link>
          </Button>
        </div>
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
