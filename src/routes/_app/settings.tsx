import { useClerk, useUser } from "@clerk/tanstack-react-start";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { FormSkeleton } from "#/components/page-skeleton";
import { InstallHint } from "#/components/settings/install-hint";
import { ThemeSetting } from "#/components/settings/theme-setting";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Separator } from "#/components/ui/separator";
import { UndoDrawer } from "#/components/undo/undo-drawer";
import { useHousehold } from "#/hooks/use-household";
import { errorMessage } from "#/lib/errors";
import { inviteUrl } from "#/lib/invite";
import { forgetOfflineData } from "#/offline/identity";

export const Route = createFileRoute("/_app/settings")({
  component: Settings,
});

function Settings() {
  const data = useHousehold();
  // The layout only renders this once the household exists; this covers the gap after leaving.
  if (!data) return <FormSkeleton fields={3} />;

  const { household, members } = data;
  const lastOneHere = members.length === 1;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <HouseholdName name={household.name} />

      <InviteLink code={household.inviteCode} />

      <section className="flex flex-col gap-3" aria-labelledby="members-heading">
        <h2 id="members-heading" className="font-medium">
          Who lives here
        </h2>
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {members.map((m) => (
            <li key={m._id} className="flex items-baseline justify-between gap-4 px-4 py-3">
              <span className="truncate">
                {m.name ?? "Someone"}
                {m.isYou && <span className="text-muted-foreground"> (you)</span>}
              </span>
              <span className="shrink-0 text-sm text-muted-foreground">
                Joined {formatDate(m.joinedAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <AgentAccess />

      <UndoDrawer />

      <ThemeSetting />

      <InstallHint />

      <Separator />

      <Account lastOneHere={lastOneHere} />
    </main>
  );
}

function HouseholdName({ name }: { name: string }) {
  const rename = useMutation(api.households.rename);
  // null while not editing, so the field shows the saved name as it changes elsewhere.
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const discard = useRef(false);
  // Only the newest save may set or clear the error line.
  const latestSave = useRef(0);

  async function commit() {
    if (discard.current) {
      discard.current = false;
      return;
    }
    if (draft === null) return;
    if (draft.trim() === name) {
      setDraft(null);
      setError(null);
      return;
    }
    const submitted = draft;
    const save = ++latestSave.current;
    try {
      await rename({ name: submitted });
      // Text typed while this save was in flight is a newer draft; keep it.
      setDraft((current) => (current === submitted ? null : current));
      if (save === latestSave.current) setError(null);
      toast("Saved");
    } catch (e) {
      if (save === latestSave.current) setError(errorMessage(e));
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        // Blur commits, so Enter and tapping away save the same way.
        (e.currentTarget.elements.namedItem("household-name") as HTMLInputElement).blur();
      }}
    >
      <Label htmlFor="household-name">Household name</Label>
      <Input
        id="household-name"
        name="household-name"
        value={draft ?? name}
        autoComplete="off"
        enterKeyHint="done"
        aria-invalid={error !== null}
        aria-describedby={error ? "household-name-error" : undefined}
        onFocus={() => setDraft((d) => d ?? name)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            discard.current = true;
            setDraft(null);
            setError(null);
            e.currentTarget.blur();
          }
        }}
      />
      {error && (
        <p id="household-name-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast.error("Could not copy. Select the text and copy it by hand.");
  }
}

function InviteLink({ code }: { code: string }) {
  const rotate = useMutation(api.households.rotateInviteCode);
  const url = inviteUrl(window.location.origin, code);

  return (
    <section className="flex flex-col gap-2" aria-labelledby="invite-heading">
      <h2 id="invite-heading" className="font-medium">
        Invite someone
      </h2>
      <p className="text-sm text-muted-foreground">
        Send this link to someone who shares the kitchen.
      </p>
      <Input
        readOnly
        value={url}
        aria-label="Invite link"
        className="font-mono text-sm"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="flex gap-2">
        <Button type="button" onClick={() => copy(url, "Link copied")}>
          Copy link
        </Button>
        <ConfirmDialog
          trigger={
            <Button type="button" variant="outline">
              Rotate
            </Button>
          }
          title="Make a new link?"
          description="The current link stops working. Everyone already here stays."
          confirmLabel="Make new link"
          onConfirm={async () => {
            await rotate({});
            toast("New link ready");
          }}
        />
      </div>
    </section>
  );
}

function AgentAccess() {
  const { isAuthenticated } = useConvexAuth();
  const tokens = useQuery(api.tokens.list, isAuthenticated ? {} : "skip");
  const create = useMutation(api.tokens.create);
  const revoke = useMutation(api.tokens.revoke);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The plaintext lives only here, until Done or leaving the page; the server keeps a hash.
  const [fresh, setFresh] = useState<{ label: string; token: string } | null>(null);
  const mcpUrl = `${window.location.origin}/mcp`;

  async function makeToken() {
    setPending(true);
    setError(null);
    try {
      const { token } = await create({ label });
      setFresh({ label: label.trim(), token });
      setLabel("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="agents-heading">
      <h2 id="agents-heading" className="font-medium">
        Agent access
      </h2>
      <p className="text-sm text-muted-foreground">
        An agent with a token can plan the week, import recipes, and keep the pantry for this
        household.
      </p>

      {fresh ? (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          <Label htmlFor="new-token">Token for {fresh.label}</Label>
          <Input
            id="new-token"
            readOnly
            value={fresh.token}
            className="font-mono text-sm"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="text-sm text-muted-foreground">Copy it now. It will not be shown again.</p>
          <Label htmlFor="mcp-url">MCP address</Label>
          <Input
            id="mcp-url"
            readOnly
            value={mcpUrl}
            className="font-mono text-sm"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => copy(fresh.token, "Token copied")}>
              Copy token
            </Button>
            <Button type="button" variant="outline" onClick={() => copy(mcpUrl, "Address copied")}>
              Copy address
            </Button>
            <Button type="button" variant="ghost" onClick={() => setFresh(null)}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void makeToken();
          }}
        >
          <Label htmlFor="token-label">New token</Label>
          <div className="flex gap-2">
            <Input
              id="token-label"
              value={label}
              placeholder="Hermes"
              autoComplete="off"
              enterKeyHint="done"
              aria-invalid={error !== null}
              aria-describedby={error ? "token-label-error" : undefined}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Button type="submit" disabled={pending || label.trim() === ""}>
              Make token
            </Button>
          </div>
          {error && (
            <p id="token-label-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      )}

      {tokens && tokens.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {tokens.map((t) => (
            <li key={t._id} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 flex-col">
                <span className={t.revokedAt ? "truncate text-muted-foreground" : "truncate"}>
                  {t.label}
                </span>
                <span className="text-sm text-muted-foreground">
                  Made {formatDate(t.createdAt)}
                  {" · "}
                  {t.revokedAt
                    ? `Revoked ${formatDate(t.revokedAt)}`
                    : t.lastUsedAt
                      ? `Last used ${formatDate(t.lastUsedAt)}`
                      : "Not used yet"}
                </span>
              </div>
              {!t.revokedAt && (
                <ConfirmDialog
                  trigger={
                    <Button type="button" variant="outline" size="sm">
                      Revoke
                    </Button>
                  }
                  title={`Revoke ${t.label}?`}
                  description="Anything using this token loses access right away."
                  confirmLabel="Revoke"
                  destructive
                  onConfirm={async () => {
                    await revoke({ tokenId: t._id });
                    toast(`${t.label} revoked`);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Account({ lastOneHere }: { lastOneHere: boolean }) {
  const leave = useMutation(api.households.leave);
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const goneForGood = lastOneHere
    ? "You are the only one here, so the household and everything in it will be deleted."
    : "The others keep the household and everything in it.";

  return (
    <section className="flex flex-col items-start gap-3" aria-label="Account">
      <Button
        type="button"
        variant="outline"
        onClick={async () => {
          // This phone's saved list, queue, and cached pages leave with the user.
          await forgetOfflineData();
          await signOut({ redirectUrl: "/sign-in" });
        }}
      >
        Sign out
      </Button>
      <ConfirmDialog
        trigger={
          <Button type="button" variant="outline">
            Leave household
          </Button>
        }
        title="Leave this household?"
        description={goneForGood}
        confirmLabel="Leave"
        destructive
        onConfirm={async () => {
          await leave({});
          await navigate({ to: "/join" });
        }}
      />
      <ConfirmDialog
        trigger={
          <Button type="button" variant="ghost" className="text-destructive">
            Delete account
          </Button>
        }
        title="Delete your account?"
        description={`You leave the household and your sign-in is removed. ${goneForGood}`}
        confirmLabel="Delete account"
        destructive
        onConfirm={async () => {
          await forgetOfflineData();
          await leave({});
          // Leaving unmounts this screen, so a failure past this point goes to a toast.
          try {
            await user?.delete();
            await navigate({ href: "/sign-in" });
          } catch {
            toast.error("You left the household. Your account could not be deleted.");
          }
        }}
      />
    </section>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
