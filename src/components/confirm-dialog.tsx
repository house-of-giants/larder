import { useState, type ReactNode } from "react";
import { Pill } from "#/components/kit/pill";
import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#/components/ui/dialog";
import { errorMessage } from "#/lib/errors";

type ConfirmDialogProps = {
  trigger: ReactNode;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  /** Runs on confirm. A thrown error stays in the dialog as a plain sentence. */
  onConfirm: () => Promise<void>;
};

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-caption text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Pill variant="outline" disabled={pending}>
              Cancel
            </Pill>
          </DialogClose>
          {destructive ? (
            // Tomato ink as an outline (DESIGN.md, the Destructive Rule), at the pill's 44px.
            <Button
              variant="destructive"
              size="pill"
              className="rounded-full text-subhead font-semibold"
              disabled={pending}
              onClick={confirm}
            >
              {confirmLabel}
            </Button>
          ) : (
            <Pill disabled={pending} onClick={confirm}>
              {confirmLabel}
            </Pill>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
