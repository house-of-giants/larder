import { createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useMemo, useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { AisleHeading } from "#/components/kit/aisle-heading";
import { Fab } from "#/components/kit/fab";
import { Pill } from "#/components/kit/pill";
import { PantrySkeleton } from "#/components/page-skeleton";
import { AddToPantry } from "#/components/pantry/add-to-pantry";
import { locationLabels } from "#/components/pantry/labels";
import { isOut, type PantryRowData } from "#/components/pantry/pantry-data";
import { PantryRow } from "#/components/pantry/pantry-row";
import { Input } from "#/components/ui/input";
import { normalizeName } from "#/lib/aliases";
import { LOCATIONS } from "#/lib/locations";

export const Route = createFileRoute("/_app/pantry")({
  component: Pantry,
});

/**
 * The pantry at a glance: the title and a count line, the search under it, then a serif
 * heading per place (sticky under the app header) over rows that say how much. Add is the
 * floating button.
 */
function Pantry() {
  const { isAuthenticated } = useConvexAuth();
  const rows = useQuery(api.pantry.list, isAuthenticated ? {} : "skip");
  const ingredients = useQuery(api.ingredients.list, isAuthenticated ? {} : "skip");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const fab = useRef<HTMLButtonElement>(null);

  const aliasesOf = useMemo(
    () => new Map((ingredients ?? []).map((i) => [i._id, i.aliases])),
    [ingredients],
  );

  if (rows === undefined || ingredients === undefined) return <PantrySkeleton />;

  const query = normalizeName(search);
  const matches = (row: PantryRowData) =>
    query === "" ||
    [row.name, ...(aliasesOf.get(row.ingredientId) ?? [])].some((term) =>
      normalizeName(term).includes(query),
    );
  const shown = rows.filter(matches);
  const out = rows.filter(isOut).length;

  return (
    <main className="mx-auto flex max-w-2xl flex-col px-5 pt-3 pb-24">
      <h1 className="font-display text-display">Pantry</h1>
      {rows.length === 0 ? (
        <p className="mt-1 text-body text-muted-foreground">Nothing on the shelf yet.</p>
      ) : (
        <>
          <p className="mt-1 text-caption text-muted-foreground">
            <span className="tabular">{rows.length}</span> on the shelf
            {out > 0 && (
              <>
                {" · "}
                <span className="tabular">{out}</span> out
              </>
            )}
          </p>
          <Input
            type="search"
            value={search}
            aria-label="Find in the pantry"
            placeholder="Find something"
            autoComplete="off"
            enterKeyHint="search"
            className="mt-3"
            onChange={(e) => setSearch(e.target.value)}
          />
          {shown.length === 0 && (
            <div className="flex flex-col items-start pt-4">
              <p className="text-body text-muted-foreground">No “{search.trim()}” on the shelf.</p>
              <Pill variant="text" className="-ml-5" onClick={() => setSearch("")}>
                Clear search
              </Pill>
            </div>
          )}
          {LOCATIONS.map((location) => {
            const here = shown.filter((row) => row.location === location);
            if (here.length === 0) return null;
            const headingId = `pantry-${location}`;
            return (
              <section key={location} aria-labelledby={headingId} className="flex flex-col">
                <AisleHeading
                  id={headingId}
                  title={locationLabels[location]}
                  count={here.length}
                  countLabel=""
                  sticky
                />
                <ul className="flex flex-col">
                  {here.map((row) => (
                    <PantryRow key={row.pantryItemId} row={row} />
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
      <Fab ref={fab} label="Add to pantry" onClick={() => setAdding(true)} />
      <AddToPantry
        open={adding}
        onOpenChange={setAdding}
        opener={fab}
        ingredients={ingredients}
        rows={rows}
      />
    </main>
  );
}
