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
import { Pill } from "#/components/kit/pill";
import { memberLabel } from "#/components/settings/member-label";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Textarea } from "#/components/ui/textarea";
import { UndoDrawer } from "#/components/undo/undo-drawer";
import { useHousehold } from "#/hooks/use-household";
import { errorMessage } from "#/lib/errors";
import { inviteUrl } from "#/lib/invite";
import { cn } from "#/lib/utils";
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
    <main className="mx-auto flex max-w-2xl flex-col gap-9 px-5 pt-3 pb-12">
      <h1 className="font-display text-display">Settings</h1>

      <HouseholdName name={household.name} />

      <InviteLink code={household.inviteCode} />

      <section className="flex flex-col" aria-labelledby="members-heading">
        <h2 id="members-heading" className={heading}>
          Who lives here
        </h2>
        <ul className="mt-1 flex flex-col">
          {members.map((m) => (
            <li
              key={m._id}
              className="flex min-h-11 items-baseline justify-between gap-4 border-b border-border py-2.5 last:border-b-0"
            >
              {/* The name comes from the sign-in's token; with no name claim it says Someone. */}
              <span className="min-w-0 text-body">{memberLabel(m.name, m.isYou)}</span>
              <span className="shrink-0 text-caption text-muted-foreground">
                Joined {formatDate(m.joinedAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <UndoDrawer />

      <ThemeSetting />

      <InstallHint />

      {/* Last of the settings: it is for whoever runs the agents, not the kitchen. */}
      <AgentAccess />

      <Account lastOneHere={lastOneHere} />
    </main>
  );
}

/** A settings section's heading: the serif title. */
const heading = "font-display text-title";
const lead = "mt-1 text-caption text-muted-foreground";

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
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        // Blur commits, so Enter and tapping away save the same way.
        (e.currentTarget.elements.namedItem("household-name") as HTMLInputElement).blur();
      }}
    >
      <Label htmlFor="household-name" className="font-display text-title font-normal">
        Household name
      </Label>
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
        <p id="household-name-error" role="alert" className="text-caption text-destructive">
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
    <section className="flex flex-col" aria-labelledby="invite-heading">
      <h2 id="invite-heading" className={heading}>
        Invite someone
      </h2>
      <p className={lead}>Send this link to someone who shares the kitchen.</p>
      {/* Read-only and wrapping, so the whole link shows, the code at its end included. */}
      <Textarea
        readOnly
        rows={2}
        value={url}
        aria-label="Invite link"
        className="mt-2.5 min-h-11 resize-none text-subhead break-all"
        onFocus={(e) => e.currentTarget.select()}
      />
      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        <Pill variant="pale" onClick={() => copy(url, "Link copied")}>
          Copy link
        </Pill>
        <ConfirmDialog
          trigger={<Pill variant="text">Rotate</Pill>}
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

  const fieldLabel = "text-caption font-normal text-muted-foreground";

  return (
    <section className="flex flex-col" aria-labelledby="agents-heading">
      <h2 id="agents-heading" className={heading}>
        Agent access
      </h2>
      <p className={lead}>
        An agent with a token can plan the week, import recipes, and keep the pantry for this
        household.
      </p>

      {fresh ? (
        <div className="mt-3 flex flex-col gap-1.5 rounded-[14px] border border-border bg-card px-4 pt-3.5 pb-2">
          <Label htmlFor="new-token" className={fieldLabel}>
            Token for {fresh.label}
          </Label>
          <Textarea
            id="new-token"
            readOnly
            rows={2}
            value={fresh.token}
            className="min-h-11 resize-none text-subhead break-all"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="text-caption text-muted-foreground">
            Copy it now. It will not be shown again.
          </p>
          <Label htmlFor="mcp-url" className={cn(fieldLabel, "mt-2")}>
            MCP address
          </Label>
          <Input
            id="mcp-url"
            readOnly
            value={mcpUrl}
            className="text-subhead"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Pill variant="pale" onClick={() => copy(fresh.token, "Token copied")}>
              Copy token
            </Pill>
            <Pill variant="text" onClick={() => copy(mcpUrl, "Address copied")}>
              Copy address
            </Pill>
            <Pill variant="text" onClick={() => setFresh(null)}>
              Done
            </Pill>
          </div>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            void makeToken();
          }}
        >
          <Label htmlFor="token-label" className="text-subhead font-normal">
            Name a new token
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="token-label"
              value={label}
              autoComplete="off"
              enterKeyHint="done"
              aria-invalid={error !== null}
              aria-describedby={error ? "token-label-error" : "token-label-hint"}
              onChange={(e) => setLabel(e.target.value)}
            />
            <Pill
              variant="pale"
              type="submit"
              className="shrink-0"
              disabled={pending || label.trim() === ""}
            >
              Make token
            </Pill>
          </div>
          {error ? (
            <p id="token-label-error" role="alert" className="text-caption text-destructive">
              {error}
            </p>
          ) : (
            <p id="token-label-hint" className="text-caption text-muted-foreground">
              Name it for the agent that will use it.
            </p>
          )}
        </form>
      )}

      {tokens && tokens.length > 0 && (
        <ul className="mt-3 flex flex-col border-t border-border">
          {tokens.map((t) => (
            <li
              key={t._id}
              className="flex min-h-14 items-center justify-between gap-3 border-b border-border py-1.5 last:border-b-0"
            >
              <div className="flex min-w-0 flex-col">
                <span className={cn("text-body", t.revokedAt && "text-muted-foreground")}>
                  {t.label}
                </span>
                <span className="text-caption text-muted-foreground">
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
                    <Pill variant="text" className="-mr-5 shrink-0">
                      Revoke
                    </Pill>
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
    <section className="flex flex-col items-start border-t border-border pt-3" aria-label="Account">
      <Pill
        variant="text"
        className="-ml-5"
        onClick={async () => {
          // This phone's saved list, queue, and cached pages leave with the user.
          await forgetOfflineData();
          await signOut({ redirectUrl: "/sign-in" });
        }}
      >
        Sign out
      </Pill>
      <ConfirmDialog
        trigger={
          <Pill variant="text" className="-ml-5">
            Leave household
          </Pill>
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
      {/* The one thing here that cannot be taken back: last, alone, under a hairline. */}
      <div className="mt-3 self-stretch border-t border-border pt-3">
        <ConfirmDialog
          trigger={
            <Pill variant="text" className="-ml-5 text-destructive">
              Delete account
            </Pill>
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
      </div>
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
