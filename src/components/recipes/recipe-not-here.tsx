import { Link } from "@tanstack/react-router";
import { Button } from "#/components/ui/button";

/** For an unknown id, a mangled link, or another household's recipe: all read the same. */
export function RecipeNotHere() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">This recipe is not here.</h1>
      <Button asChild variant="outline">
        <Link to="/recipes">All recipes</Link>
      </Button>
    </main>
  );
}
