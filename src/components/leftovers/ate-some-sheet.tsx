import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { amountWords } from "#/lib/amounts";
import { errorMessage } from "#/lib/errors";
import { parseQuantity } from "#/lib/quantities";
import type { Leftover } from "./types";

/** "Ate..." for more than one at a time, or half of one. */
export function AteSomeSheet({
  food,
  open,
  onOpenChange,
}: {
  food: Leftover;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto w-full max-w-2xl rounded-t-xl">
        <SheetHeader>
          <SheetTitle>How many did you eat?</SheetTitle>
          <SheetDescription>
            {food.name}:{" "}
            <span className="num">
              {amountWords(food.remaining.text, food.remaining.decimal, food.unit)}
            </span>{" "}
            left
          </SheetDescription>
        </SheetHeader>
        {open && <AteSomeForm food={food} close={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function AteSomeForm({ food, close }: { food: Leftover; close: () => void }) {
  const consume = useMutation(api.leftovers.consume);
  const [quantityText, setQuantityText] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const id = `ate-${food._id}`;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const decimal = parseQuantity(quantityText);
    if (decimal === null || decimal <= 0) {
      setError("Use a number like 1 or 1/2.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { remaining } = await consume({ preparedFoodId: food._id, quantityText });
      toast(
        remaining.decimal === 0
          ? `${food.name}: all gone.`
          : `${food.name}: ${amountWords(remaining.text, remaining.decimal, food.unit)} left.`,
      );
      close();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={id}>Ate</Label>
        <Input
          id={id}
          value={quantityText}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          className="num h-11"
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => setQuantityText(e.target.value)}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="-mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="h-12" disabled={pending}>
        Save
      </Button>
    </form>
  );
}
