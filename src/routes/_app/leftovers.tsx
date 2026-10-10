import { Link, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { Pill } from "#/components/kit/pill";
import { LeftoverCard } from "#/components/leftovers/leftover-card";
import { LeftoversSkeleton } from "#/components/page-skeleton";

export const Route = createFileRoute("/_app/leftovers")({
  component: Leftovers,
});

function Leftovers() {
  const { isAuthenticated } = useConvexAuth();
  const foods = useQuery(api.leftovers.list, isAuthenticated ? {} : "skip");
  // Read once when the screen opens; "made today" only needs the day.
  const [now] = useState(() => Date.now());
  const title = useRef<HTMLHeadingElement>(null);

  if (foods === undefined) return <LeftoversSkeleton />;

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-5 pt-3 pb-24">
      <h1 ref={title} tabIndex={-1} className="font-display text-display outline-none">
        Leftovers
      </h1>
      {foods.length === 0 ? (
        <div className="flex flex-col items-start">
          <p className="mt-1 text-body text-muted-foreground">
            Nothing left over. Say Made it on a recipe.
          </p>
          <Pill variant="text" asChild className="-ml-5">
            <Link to="/week">This week</Link>
          </Pill>
        </div>
      ) : (
        <ul className="mt-1 flex flex-col">
          {foods.map((food) => (
            <LeftoverCard key={food._id} food={food} now={now} title={title} />
          ))}
        </ul>
      )}
    </main>
  );
}
