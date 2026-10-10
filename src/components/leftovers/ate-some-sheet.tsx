import { useMutation } from "convex/react";
import { type FormEvent, type RefObject, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { BatchPicker } from "#/components/cook/batch-picker";
import { HalfSheet } from "#/components/kit/half-sheet";
import { Pill } from "#/components/kit/pill";
import { shownUnit } from "#/components/recipes/recipe-text";
import { amountWords } from "#/lib/amounts";
import { errorMessage } from "#/lib/errors";
import { parseQuantity } from "#/lib/quantities";
import { pluralUnit } from "#/lib/units";
import { RemainingWords } from "./leftover-card";
import type { Leftover } from "./types";

/** "Ate…" for more than one at a time, or half of one, in a half sheet. */
export function AteSomeSheet({
  food,
  open,
  onOpenChange,
  opener,
}: {
  food: Leftover;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener: RefObject<HTMLElement | null>;
}) {
  const formId = `ate-${food._id}-form`;
  const [pending, setPending] = useState(false);
  return (
    <HalfSheet
      open={open}
      onOpenChange={onOpenChange}
      opener={opener}
      title="How many did you eat?"
      note={
        <>
          {food.name}: <RemainingWords food={food} /> left
        </>
      }
      footer={
        <Pill sheet type="submit" form={formId} disabled={pending}>
          Save
        </Pill>
      }
    >
      {open && (
        <AteSomeForm
          id={formId}
          food={food}
          onPendingChange={setPending}
          close={() => onOpenChange(false)}
        />
      )}
    </HalfSheet>
  );
}

function AteSomeForm({
  id: formId,
  food,
  onPendingChange,
  close,
}: {
  id: string;
  food: Leftover;
  onPendingChange: (pending: boolean) => void;
  close: () => void;
}) {
  const consume = useMutation(api.leftovers.consume);
  const [quantityText, setQuantityText] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const id = `ate-${food._id}`;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const decimal = parseQuantity(quantityText);
    if (decimal === null || decimal <= 0) {
      setError("Use a number like 1 or 1/2.");
      return;
    }
    onPendingChange(true);
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
    } finally {
      onPendingChange(false);
    }
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="flex flex-col pb-2">
      <BatchPicker
        id={id}
        label="Ate"
        unit={{ one: shownUnit(food.unit), many: pluralUnit("2", shownUnit(food.unit)) }}
        value={quantityText}
        onChange={(text) => {
          setQuantityText(text);
          setError(null);
        }}
        error={error}
      />
    </form>
  );
}
