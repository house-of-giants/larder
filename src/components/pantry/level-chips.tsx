import { Chip } from "#/components/kit/chip";
import { LEVELS, type Level } from "#/lib/levels";
import { levelLabels } from "./labels";

/** Four chips, full to out, the current level in tomato pale. */
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
    <fieldset className="m-0 flex min-w-0 shrink-0 gap-1.5 border-0 p-0">
      <legend className="sr-only">How much {name} is left</legend>
      {LEVELS.map((level) => {
        const current = level === value;
        return (
          <Chip
            key={level}
            selected={current}
            disabled={disabled}
            onClick={() => {
              if (!current) onChange(level);
            }}
            className="min-w-11 disabled:opacity-60"
          >
            {levelLabels[level]}
          </Chip>
        );
      })}
    </fieldset>
  );
}
