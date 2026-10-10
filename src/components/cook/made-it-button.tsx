import { CookingPot } from "lucide-react";
import { useRef, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Pill } from "#/components/kit/pill";
import { MadeItSheet } from "./made-it-sheet";

/**
 * "Made it" on a recipe, with its sheet: the pale pill with the pot (DESIGN.md, Pale pill),
 * or the outline where something else leads. Already cooked, it reads "Made it again" and
 * takes the outline.
 */
export function MadeItButton({
  recipeId,
  recipeName,
  weekId,
  defaultMultiplier,
  made,
  variant = made ? "outline" : "pale",
  className,
}: {
  recipeId: Id<"recipes">;
  recipeName: string;
  weekId?: Id<"weeks">;
  defaultMultiplier?: string;
  /** Already cooked once, so the button reads as cooking again. */
  made?: boolean;
  variant?: "pale" | "outline";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Pill
        ref={opener}
        type="button"
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <CookingPot aria-hidden className="size-[18px]" />
        {made ? "Made it again" : "Made it"}
      </Pill>
      <MadeItSheet
        recipeId={recipeId}
        recipeName={recipeName}
        weekId={weekId}
        defaultMultiplier={defaultMultiplier}
        open={open}
        onOpenChange={setOpen}
        opener={opener}
      />
    </>
  );
}
