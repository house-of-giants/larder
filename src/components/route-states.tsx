import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { ConvexError } from "convex/values";
import { Pill } from "#/components/kit/pill";

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
      : "Check the signal and try again.";

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start px-5 pt-3">
      <h1 className="font-display text-display">This did not load.</h1>
      <p role="alert" className="mt-1 text-body text-muted-foreground">
        {line}
      </p>
      <Pill
        variant="pale"
        className="mt-4"
        onClick={() => {
          // Clears the boundary and runs the route's loaders again.
          reset?.();
          void router.invalidate();
        }}
      >
        Try again
      </Pill>
    </main>
  );
}

/** An address that is not a screen. */
export function NotFound() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-start px-5 pt-3">
      <h1 className="font-display text-display">Nothing at this address.</h1>
      <Pill variant="text" asChild className="mt-1 -ml-5">
        <Link to="/week">This week</Link>
      </Pill>
    </main>
  );
}
