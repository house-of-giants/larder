import { type RefObject, useRef, useState } from "react";
import { Amount } from "#/components/kit/amount";
import { cn } from "#/lib/utils";
import { isOut, type PantryRowData } from "./pantry-data";
import { PantryItemSheet } from "./pantry-item-sheet";
import { shelfLine } from "./shelf-line";

/**
 * One thing on the shelf, in the list row's shape without the circle: the name, and under
 * it how much ("10 slices", "Half") in tomato, or "out" in quiet ink. The whole row opens
 * the item sheet, where Out is the first control.
 */
export function PantryRow({
  row,
  title,
}: {
  row: PantryRowData;
  /** The screen's title, where focus lands if the row is removed from its sheet. */
  title: RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const out = isOut(row);
  const line = shelfLine(row);

  return (
    <li className="flex border-b border-border last:border-b-0">
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-14 min-w-0 flex-1 flex-col justify-center rounded-md py-1.5 text-left focus-ring"
      >
        <span className={cn("text-body", out && "text-muted-foreground")}>{row.name}</span>
        <span data-testid="pantry-amount" className="mt-0.5 text-caption">
          {line.kind === "amount" && <Amount quantityText={line.quantityText} unit={line.unit} />}
          {line.kind === "level" && <span className="font-semibold text-primary">{line.word}</span>}
          {line.kind === "out" && <span className="text-muted-foreground">out</span>}
        </span>
      </button>
      <PantryItemSheet
        row={row}
        open={open}
        onOpenChange={setOpen}
        opener={opener}
        fallbackFocus={title}
      />
    </li>
  );
}
