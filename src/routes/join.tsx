import { Navigate, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { PageSkeleton } from "#/components/page-skeleton";
import { Pill } from "#/components/kit/pill";
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-12 pb-10">
      <h1 className="font-display text-display">Larder</h1>
      <p className="mt-1 text-body text-muted-foreground">
        {code
          ? "Someone sent you a code. Join their household below."
          : "Start a household, or join one with a code from someone in it."}
      </p>
      {/* One tomato pill: the way in that fits how they arrived. The other waits behind a text action. */}
      {code ? (
        <>
          <JoinForm initialCode={code} lead />
          <Other label="Start a household instead">
            <StartForm />
          </Other>
        </>
      ) : (
        <>
          <StartForm lead />
          <Other label="Join with a code">
            <JoinForm initialCode="" />
          </Other>
        </>
      )}
    </main>
  );
}

/** The second way in, behind a text action until it is asked for; then its field has focus. */
function Other({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) box.current?.querySelector("input")?.focus();
  }, [open]);
  return (
    <div ref={box} className="mt-6 flex flex-col items-start border-t border-border pt-2">
      {open ? (
        children
      ) : (
        <Pill variant="text" className="-ml-5" onClick={() => setOpen(true)}>
          {label}
        </Pill>
      )}
    </div>
  );
}

const label = "text-subhead font-normal";

/** `lead`: this is the screen's one tomato pill; otherwise it is the pale one. */
function StartForm({ lead = false }: { lead?: boolean }) {
  const create = useMutation(api.households.create);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const { pending, error, run } = useSubmit();

  return (
    <form
      className="mt-6 flex w-full flex-col gap-1.5"
      onSubmit={run(async () => {
        await create({ name });
        await navigate({ to: "/week" });
      })}
    >
      <Label htmlFor="household-name" className={label}>
        Household name
      </Label>
      <Input
        id="household-name"
        value={name}
        autoComplete="off"
        aria-invalid={error !== null}
        aria-describedby={error ? "start-error" : "household-name-hint"}
        onChange={(e) => setName(e.target.value)}
      />
      <p id="household-name-hint" className="text-caption text-muted-foreground">
        Something the house would say. You can invite the others from Settings.
      </p>
      <FormError id="start-error" error={error} />
      <Pill
        type="submit"
        variant={lead ? "primary" : "pale"}
        className="mt-3 self-start"
        disabled={pending}
      >
        Start a household
      </Pill>
    </form>
  );
}

function JoinForm({ initialCode, lead = false }: { initialCode: string; lead?: boolean }) {
  const join = useMutation(api.households.join);
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode);
  const { pending, error, run } = useSubmit();

  return (
    <form
      className="mt-6 flex w-full flex-col gap-1.5"
      onSubmit={run(async () => {
        await join({ inviteCode: codeFromInput(code) });
        await navigate({ to: "/week" });
      })}
    >
      <Label htmlFor="invite-code" className={label}>
        Code
      </Label>
      <Input
        id="invite-code"
        value={code}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        aria-invalid={error !== null}
        aria-describedby={error ? "join-error" : "invite-code-hint"}
        onChange={(e) => setCode(e.target.value)}
      />
      <p id="invite-code-hint" className="text-caption text-muted-foreground">
        Paste the link or type the code you were sent.
      </p>
      <FormError id="join-error" error={error} />
      <Pill
        type="submit"
        variant={lead ? "primary" : "pale"}
        className="mt-3 min-w-28 self-start"
        disabled={pending}
      >
        Join
      </Pill>
    </form>
  );
}

function FormError({ id, error }: { id: string; error: string | null }) {
  if (!error) return null;
  return (
    <p id={id} role="alert" className="text-caption text-destructive">
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
