import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { cn } from "#/lib/utils";

const quickPicks = ["1/2", "1", "2"] as const;

/**
 * An amount picked with one tap on 1/2, 1, or 2, or typed in: batches made, portions eaten.
 */
export function MultiplierPicker({
  id,
  value,
  onChange,
  error,
  label = "Batches",
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  error: string | null;
  label?: string;
}) {
  const trimmed = value.trim();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Label htmlFor={id} className="mr-auto text-sm text-muted-foreground">
          {label}
        </Label>
        <fieldset className="flex gap-1.5">
          <legend className="sr-only">{label}</legend>
          {quickPicks.map((pick) => (
            <Button
              key={pick}
              type="button"
              variant="outline"
              aria-pressed={trimmed === pick}
              className={cn(
                "num h-11 min-w-12",
                trimmed === pick && "border-primary bg-primary/10 text-primary",
              )}
              onClick={() => onChange(pick)}
            >
              {pick}
            </Button>
          ))}
        </fieldset>
        <Input
          id={id}
          value={value}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          aria-label={`${label}, typed`}
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          className="num h-11 w-20 text-center"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
