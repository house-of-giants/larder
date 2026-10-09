import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { PageSkeleton } from "#/components/page-skeleton";
import { AddToPantry } from "#/components/pantry/add-to-pantry";
import { locationLabels } from "#/components/pantry/labels";
import type { PantryRowData } from "#/components/pantry/pantry-data";
import { PantryRow } from "#/components/pantry/pantry-row";
import { Input } from "#/components/ui/input";
import { normalizeName } from "#/lib/aliases";
import { LOCATIONS } from "#/lib/locations";

export const Route = createFileRoute("/_app/pantry")({
  component: Pantry,
});

function Pantry() {
  const { isAuthenticated } = useConvexAuth();
  const rows = useQuery(api.pantry.list, isAuthenticated ? {} : "skip");
  const ingredients = useQuery(api.ingredients.list, isAuthenticated ? {} : "skip");
  const [search, setSearch] = useState("");

  const aliasesOf = useMemo(
    () => new Map((ingredients ?? []).map((i) => [i._id, i.aliases])),
    [ingredients],
  );

  if (rows === undefined || ingredients === undefined) return <PageSkeleton />;

  const query = normalizeName(search);
  const matches = (row: PantryRowData) =>
    query === "" ||
    [row.name, ...(aliasesOf.get(row.ingredientId) ?? [])].some((term) =>
      normalizeName(term).includes(query),
    );
  const shown = rows.filter(matches);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Pantry</h1>
        {rows.length > 0 && <AddToPantry ingredients={ingredients} rows={rows} />}
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-lg border border-dashed px-4 py-8">
          <p className="text-muted-foreground">Nothing on the shelf yet.</p>
          <AddToPantry ingredients={ingredients} rows={rows} />
        </div>
      ) : (
        <>
          <Input
            type="search"
            value={search}
            placeholder="Find something"
            aria-label="Find in the pantry"
            autoComplete="off"
            enterKeyHint="search"
            onChange={(e) => setSearch(e.target.value)}
          />
          {shown.length === 0 && (
            <p className="text-muted-foreground">No “{search.trim()}” on the shelf.</p>
          )}
          {LOCATIONS.map((location) => {
            const here = shown.filter((row) => row.location === location);
            if (here.length === 0) return null;
            const headingId = `pantry-${location}`;
            return (
              <section key={location} aria-labelledby={headingId} className="flex flex-col gap-2">
                <h2
                  id={headingId}
                  className="flex items-baseline justify-between text-sm font-medium text-muted-foreground"
                >
                  {locationLabels[location]}
                  <span className="num">{here.length}</span>
                </h2>
                <ul className="flex flex-col divide-y rounded-lg border bg-card">
                  {here.map((row) => (
                    <PantryRow key={row.pantryItemId} row={row} />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </main>
  );
}
