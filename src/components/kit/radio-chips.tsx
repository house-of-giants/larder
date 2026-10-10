import { cn } from "#/lib/utils";

/**
 * One choice of a few, drawn as chips (DESIGN.md, Chips) over real radios, so arrow keys
 * move between them and the choice reads as one. The picked chip is tomato pale; each
 * label is 44px tall, the tap floor, with the focus ring around the chip itself.
 */
export function RadioChips<T extends string>({
  name,
  legend,
  options,
  value,
  onChange,
  className,
}: {
  name: string;
  legend: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <fieldset className={cn("m-0 flex min-w-0 flex-wrap gap-x-2 border-0 p-0", className)}>
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <label key={option.value} className="group flex min-h-11 cursor-pointer items-center">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={on}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={cn(
                "min-w-14 rounded-sm border px-2.5 py-1.5 text-center text-caption whitespace-nowrap",
                "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring peer-focus-visible:outline-solid",
                on
                  ? "border-transparent bg-accent font-semibold text-accent-foreground"
                  : "border-border bg-card text-muted-foreground group-hover:text-foreground",
              )}
            >
              {option.label}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
