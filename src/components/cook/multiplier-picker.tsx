import type { ComponentProps } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { cn } from "#/lib/utils";

const quickPicks = ["1/2", "1", "2"] as const;

/**
 * An amount picked with one tap on 1/2, 1, or 2, or typed in after them: batches planned,
 * batches made, portions eaten. One control everywhere it is asked. The picks are 44px, the
 * pressed one tomato pale; the typed field follows them.
 *
 * `pressed` says which pick shows pressed when that is not simply the typed value (the plan
 * keeps a draft apart from what is saved). `onPick` handles a pick on its own (it defaults
 * to `onChange`); `fieldProps` and `pickProps` add handlers to the field and to each pick.
 */
export function MultiplierPicker({
  id,
  value,
  onChange,
  error,
  label = "Batches",
  pressed = value.trim(),
  onPick = onChange,
  fieldProps,
  pickProps,
}: {
  id: string;
  value: string;
  onChange: (text: string) => void;
  error: string | null;
  label?: string;
  pressed?: string;
  onPick?: (pick: string) => void;
  fieldProps?: Omit<ComponentProps<"input">, "id" | "value" | "onChange">;
  pickProps?: Omit<ComponentProps<"button">, "onClick">;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="mr-auto pr-2 text-subhead font-normal text-muted-foreground">
          {label}
        </Label>
        <fieldset className="flex gap-1.5">
          <legend className="sr-only">{label}</legend>
          {quickPicks.map((pick) => (
            <Button
              key={pick}
              type="button"
              variant="outline"
              aria-pressed={pressed === pick}
              className={cn(
                "tabular h-11 min-w-12 text-subhead",
                pressed === pick &&
                  "border-transparent bg-accent font-semibold text-accent-foreground hover:bg-accent",
              )}
              {...pickProps}
              onClick={() => onPick(pick)}
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
          className="tabular h-11 w-20 text-center"
          {...fieldProps}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
