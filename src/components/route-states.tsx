import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { ConvexError } from "convex/values";
import { Button } from "#/components/ui/button";

/**
 * A screen that failed to load or render, a Convex query error included. As the root
 * error component it fills the page; as the router's default it sits inside the app
 * shell, so the tabs stay.
 */
export function ErrorScreen({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  // The server's own words when it gave some ("Sign in first."), else a plain line.
  const line =
    error instanceof ConvexError && typeof error.data === "string"
      ? error.data
      : "This did not load. Check the signal and try again.";

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-6">
      <p role="alert">{line}</p>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          // Clears the boundary and runs the route's loaders again.
          reset?.();
          void router.invalidate();
        }}
      >
        Try again
      </Button>
    </main>
  );
}

/** An address that is not a screen. */
export function NotFound() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nothing at this address.</h1>
      <Button asChild variant="outline">
        <Link to="/week">This week</Link>
      </Button>
    </main>
  );
}
