import { useClerk, useUser } from "@clerk/tanstack-react-start";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { ConfirmDialog } from "#/components/confirm-dialog";
import { PageSkeleton } from "#/components/page-skeleton";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { Separator } from "#/components/ui/separator";
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
  if (!data) return <PageSkeleton />;

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

function InviteLink({ code }: { code: string }) {
  const rotate = useMutation(api.households.rotateInviteCode);
  const url = inviteUrl(window.location.origin, code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast.error("Could not copy. Press on the link and copy it by hand.");
    }
  }

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
        <Button type="button" onClick={copy}>
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
