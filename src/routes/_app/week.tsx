import { createFileRoute } from "@tanstack/react-router";

// Placeholder until Phase 3 builds the week plan.
export const Route = createFileRoute("/_app/week")({
  component: Week,
});

function Week() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-2 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">This week</h1>
      <p className="text-muted-foreground">No recipes picked yet.</p>
    </main>
  );
}
