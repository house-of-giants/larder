import { useId, useState, type ReactNode, type Ref } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Input } from "#/components/ui/input";
import { resolveIngredient } from "#/lib/aliases";
import { errorMessage } from "#/lib/errors";
import { cn } from "#/lib/utils";
import { matchIngredients, type IngredientOption } from "./recipe-text";

type IngredientPickerProps = {
  id: string;
  options: readonly IngredientOption[];
  value: Id<"ingredients"> | null;
  onChange: (id: Id<"ingredients">) => void;
  /** When set, a name with no exact match can be added as a new ingredient. */
  onCreate?: (name: string) => Promise<Id<"ingredients">>;
  placeholder?: string;
  invalid?: boolean;
  /** Choices in the flow under the field, with no shadow, instead of floating over the page. */
  inline?: boolean;
  ref?: Ref<HTMLDivElement>;
};

/**
 * A type-to-filter picker over the household's ingredients. Filtering is local; the
 * only write is the optional "Add as a new ingredient" choice.
 */
export function IngredientPicker({
  id,
  options,
  value,
  onChange,
  onCreate,
  placeholder = "Find an ingredient",
  invalid = false,
  inline = false,
  ref,
}: IngredientPickerProps) {
  const listId = useId();
  // null while closed: the field then shows the picked ingredient's name.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A just-created ingredient can be picked before the options query catches up.
  const [created, setCreated] = useState<{ id: Id<"ingredients">; name: string } | null>(null);

  const picked =
    options.find((o) => o._id === value)?.name ?? (created?.id === value ? created.name : "");
  const open = query !== null;
  const matches = open ? matchIngredients(options, query) : [];
  const typed = query?.trim() ?? "";
  // Offered only when the name resolves to no ingredient, the same rule the server uses.
  const canCreate =
    onCreate !== undefined && typed !== "" && resolveIngredient(typed, options).kind === "none";
  const choiceCount = matches.length + (canCreate ? 1 : 0);

  function pick(next: Id<"ingredients">) {
    onChange(next);
    setQuery(null);
    setError(null);
  }

  async function create() {
    if (!onCreate || pending) return;
    setPending(true);
    setError(null);
    try {
      const newId = await onCreate(typed);
      setCreated({ id: newId, name: typed });
      pick(newId);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  function choose(index: number) {
    if (index < matches.length) pick(matches[index]._id);
    else if (canCreate) void create();
  }

  return (
    <div
      ref={ref}
      className="relative"
      // Close when focus leaves the field and its choices, not when it moves between them.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setQuery(null);
      }}
    >
      <Input
        id={id}
        aria-invalid={invalid || error !== null}
        aria-describedby={open && choiceCount > 0 ? listId : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={query ?? picked}
        // Read-only, not disabled, while creating: focus and the open list survive.
        readOnly={pending}
        aria-busy={pending}
        onFocus={(e) => {
          if (query !== null) return;
          setQuery(picked);
          setActive(0);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, choiceCount - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            // Enter picks; it never submits the recipe from inside the picker.
            e.preventDefault();
            if (choiceCount > 0) choose(active);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setQuery(null);
          }
        }}
      />
      {open && choiceCount > 0 && (
        <ul
          id={listId}
          aria-label="Matching ingredients"
          className={cn(
            "mt-1 overflow-auto rounded-md border bg-popover py-1 text-popover-foreground",
            inline ? "max-h-56" : "absolute inset-x-0 top-full z-20 max-h-64 shadow-md",
          )}
        >
          {matches.map((o, index) => (
            <li key={o._id}>
              <Choice active={index === active} onChoose={() => pick(o._id)}>
                <span className="truncate">{o.name}</span>
                {o.kind === "level" && (
                  <span className="shrink-0 text-xs text-muted-foreground">by level</span>
                )}
              </Choice>
            </li>
          ))}
          {canCreate && (
            <li>
              <Choice
                active={active === matches.length}
                className="text-primary"
                onChoose={() => void create()}
              >
                Add "{typed}" as a new ingredient
              </Choice>
            </li>
          )}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Choice({
  active,
  className,
  onChoose,
  children,
}: {
  active: boolean;
  className?: string;
  onChoose: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none",
        active && "bg-accent text-accent-foreground",
        className,
      )}
      // Mouse and touch keep focus in the field, so the list stays put until the pick lands.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onChoose}
    >
      {children}
    </button>
  );
}
