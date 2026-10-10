import { useMutation } from "convex/react";
import { useState, type FormEvent, type RefObject } from "react";
import { toast } from "sonner";
import { HalfSheet } from "#/components/kit/half-sheet";
import { Pill } from "#/components/kit/pill";
import { categoryLabels } from "#/components/pantry/labels";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";
import { errorMessage } from "#/lib/errors";
import { addItem } from "./list-data";

const FORM_ID = "add-something";

/**
 * Something the plan did not ask for, in a half sheet off the floating button. It goes on
 * this list only, never the pantry. With no signal the sheet says so and Add stays off.
 */
export function AddSomething({
  open,
  onOpenChange,
  opener,
  canSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opener: RefObject<HTMLElement | null>;
  canSend: boolean;
}) {
  const add = useMutation(addItem);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("other");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = name.trim().replace(/\s+/g, " ");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (displayName === "" || !canSend) return;
    setPending(true);
    setError(null);
    try {
      await add({
        displayName,
        quantityText: quantity.trim() || undefined,
        unit: unit.trim() || undefined,
        category,
      });
      toast(`${displayName}: on the list.`);
      setName("");
      setQuantity("");
      setUnit("");
      setCategory("other");
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  const fieldLabel = "text-caption font-normal text-muted-foreground";

  return (
    <HalfSheet
      open={open}
      onOpenChange={onOpenChange}
      opener={opener}
      title="Add something"
      footer={
        <Pill
          sheet
          type="submit"
          form={FORM_ID}
          disabled={displayName === "" || pending || !canSend}
        >
          Add to the list
        </Pill>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="flex flex-col gap-3 pb-1">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="add-something-name" className="text-subhead font-normal">
            What else?
          </Label>
          <Input
            id="add-something-name"
            value={name}
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-[5rem_5rem_1fr] gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="add-something-quantity" className={fieldLabel}>
              How many
            </Label>
            <Input
              id="add-something-quantity"
              value={quantity}
              inputMode="decimal"
              autoComplete="off"
              className="tabular"
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="add-something-unit" className={fieldLabel}>
              Unit
            </Label>
            <Input
              id="add-something-unit"
              value={unit}
              autoComplete="off"
              onChange={(e) => setUnit(e.target.value)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor="add-something-section" className={fieldLabel}>
              Section
            </Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="add-something-section" className="w-full data-[size=default]:h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {error && (
          <p role="alert" className="text-caption text-destructive">
            {error}
          </p>
        )}
        {!canSend && (
          <p className="text-caption text-muted-foreground">
            Adding needs a signal. Check-offs still save.
          </p>
        )}
      </form>
    </HalfSheet>
  );
}
