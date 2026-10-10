import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { categoryLabels } from "#/components/pantry/labels";
import { Button } from "#/components/ui/button";
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

/** Something the plan did not ask for. It goes on this list only, never the pantry. */
export function AddSomething({ canSend }: { canSend: boolean }) {
  const add = useMutation(addItem);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("other");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName = name.trim().replace(/\s+/g, " ");

  async function submit(event: React.FormEvent) {
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
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      aria-labelledby="add-something-heading"
      className="flex flex-col gap-3 rounded-lg border bg-card p-4"
    >
      <h2 id="add-something-heading" className="font-medium">
        Add something
      </h2>
      <div className="flex flex-col gap-2">
        <Label htmlFor="add-something-name" className="sr-only">
          What
        </Label>
        <Input
          id="add-something-name"
          value={name}
          placeholder="paper towels, limes"
          autoComplete="off"
          enterKeyHint="done"
          className="h-11"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-[5rem_5rem_1fr] gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="add-something-quantity" className="text-xs text-muted-foreground">
            How many
          </Label>
          <Input
            id="add-something-quantity"
            value={quantity}
            placeholder="2"
            autoComplete="off"
            className="tabular h-11"
            onChange={(e) => setQuantity(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="add-something-unit" className="text-xs text-muted-foreground">
            Unit
          </Label>
          <Input
            id="add-something-unit"
            value={unit}
            placeholder="each"
            autoComplete="off"
            className="h-11"
            onChange={(e) => setUnit(e.target.value)}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <Label htmlFor="add-something-section" className="text-xs text-muted-foreground">
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
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {canSend ? null : (
        <p className="text-sm text-muted-foreground">
          Adding needs a signal. Check-offs still save.
        </p>
      )}
      <Button type="submit" className="h-11" disabled={displayName === "" || pending || !canSend}>
        Add to the list
      </Button>
    </form>
  );
}
