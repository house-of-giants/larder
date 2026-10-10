import { Link } from "@tanstack/react-router";
import { Pill } from "#/components/kit/pill";

/** For an unknown id, a mangled link, or another household's recipe: all read the same. */
export function RecipeNotHere() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start px-5 pt-3">
      <h1 className="font-display text-display">This recipe is not here.</h1>
      <Pill variant="text" asChild className="mt-1 -ml-5">
        <Link to="/recipes">All recipes</Link>
      </Pill>
    </main>
  );
}
