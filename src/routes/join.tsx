import { Navigate, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "../../convex/_generated/api";
import { PageSkeleton } from "#/components/page-skeleton";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { useHousehold } from "#/hooks/use-household";
import { requireSignedIn, returnTo } from "#/lib/auth-gate";
import { errorMessage } from "#/lib/errors";
import { codeFromInput } from "#/lib/invite";

type JoinSearch = { code?: string };

export const Route = createFileRoute("/join")({
  // Declares `code` for links and navigation. The screen reads the raw text instead:
  // the router JSON-parses search values, so a code like "100000000000" or
  // "12e345678901" would arrive as a number (or Infinity).
  validateSearch: (search: Record<string, unknown>): JoinSearch => ({
    code: typeof search.code === "string" ? search.code : undefined,
  }),
  beforeLoad: ({ location }) => requireSignedIn({ data: returnTo(location) }),
  component: Join,
});

function Join() {
  const household = useHousehold();
  const code = useLocation({
    select: (location) => new URLSearchParams(location.searchStr).get("code") ?? undefined,
  });

  if (household === undefined) return <PageSkeleton />;
  if (household !== null) return <Navigate to="/week" replace />;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Larder</h1>
        <p className="text-muted-foreground">
          {code
            ? "Someone sent you a code. Join their household below."
            : "Start a household, or join one with a code from someone in it."}
        </p>
      </header>
      {code ? (
        <>
          <JoinCard initialCode={code} />
          <StartCard />
        </>
      ) : (
        <>
          <StartCard />
          <JoinCard initialCode="" />
        </>
      )}
    </main>
  );
}

function StartCard() {
  const create = useMutation(api.households.create);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const { pending, error, run } = useSubmit();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start a household</CardTitle>
        <CardDescription>You can invite the others from Settings.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={run(async () => {
            await create({ name });
            await navigate({ to: "/week" });
          })}
        >
          <Label htmlFor="household-name">Name</Label>
          <Input
            id="household-name"
            value={name}
            placeholder="Elm Street"
            autoComplete="off"
            aria-invalid={error !== null}
            aria-describedby={error ? "start-error" : undefined}
            onChange={(e) => setName(e.target.value)}
          />
          <FormError id="start-error" error={error} />
          <Button type="submit" disabled={pending}>
            Start
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function JoinCard({ initialCode }: { initialCode: string }) {
  const join = useMutation(api.households.join);
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode);
  const { pending, error, run } = useSubmit();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Join with a code</CardTitle>
        <CardDescription>Paste the link or type the code you were sent.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={run(async () => {
            await join({ inviteCode: codeFromInput(code) });
            await navigate({ to: "/week" });
          })}
        >
          <Label htmlFor="invite-code">Code</Label>
          <Input
            id="invite-code"
            value={code}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="font-mono"
            aria-invalid={error !== null}
            aria-describedby={error ? "join-error" : undefined}
            onChange={(e) => setCode(e.target.value)}
          />
          <FormError id="join-error" error={error} />
          <Button type="submit" disabled={pending}>
            Join
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function FormError({ id, error }: { id: string; error: string | null }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );
}

/** One submit at a time; a failure becomes a plain sentence under the form. */
function useSubmit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = (action: () => Promise<void>) => async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return { pending, error, run };
}
