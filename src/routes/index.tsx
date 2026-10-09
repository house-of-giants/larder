import { UserButton } from "@clerk/tanstack-react-start";
import { auth } from "@clerk/tanstack-react-start/server";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { clerkConfigured } from "#/lib/clerk-config";

// Phase 0 placeholder. Phase 1 replaces this with the household redirect (/join or /week).
const authStateFn = createServerFn({ method: "GET" }).handler(async () => {
  if (!clerkConfigured()) {
    return { userId: null };
  }
  const { isAuthenticated, userId } = await auth();
  if (!isAuthenticated) {
    // href, not `to`: the sign-in screen is a catch-all route and this is its base path.
    throw redirect({ href: "/sign-in" });
  }
  return { userId };
});

export const Route = createFileRoute("/")({
  beforeLoad: () => authStateFn(),
  loader: ({ context }) => ({ userId: context.userId }),
  component: Home,
});

function Home() {
  const { userId } = Route.useLoaderData();
  const ping = useQuery(api.health.ping, {});

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-10">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Larder</h1>
        <UserButton />
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Signed in as</dt>
        <dd className="font-mono tabular-nums">{userId ?? "nobody"}</dd>
        <dt className="text-muted-foreground">Convex</dt>
        <dd className="font-mono">
          {ping === undefined
            ? "connecting"
            : ping.signedIn
              ? "reachable, identity verified"
              : "reachable, no identity"}
        </dd>
      </dl>
    </main>
  );
}
