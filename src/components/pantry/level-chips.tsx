import { LEVELS, type Level } from "#/lib/levels";
import { cn } from "#/lib/utils";
import { levelLabels } from "./labels";

/** Four segmented chips, full to out, with the current level filled. */
export function LevelChips({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  value: Level | undefined;
  onChange: (level: Level) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 shrink-0 overflow-hidden rounded-md border bg-background p-0">
      <legend className="sr-only">How much {name} is left</legend>
      {LEVELS.map((level) => {
        const current = level === value;
        return (
          <button
            key={level}
            type="button"
            aria-pressed={current}
            disabled={disabled}
            onClick={() => {
              if (!current) onChange(level);
            }}
            className={cn(
              "min-h-10 min-w-11 border-l px-2 text-xs font-medium transition-colors first:border-l-0 disabled:opacity-60",
              current
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {levelLabels[level]}
          </button>
        );
      })}
    </fieldset>
  );
}
