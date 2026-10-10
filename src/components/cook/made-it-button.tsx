import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "#/components/ui/button";
import { MadeItSheet } from "./made-it-sheet";

/** The "Made it" button on a recipe card or page, with its sheet. */
export function MadeItButton({
  recipeId,
  recipeName,
  weekId,
  defaultMultiplier,
  made,
  className,
}: {
  recipeId: Id<"recipes">;
  recipeName: string;
  weekId?: Id<"weeks">;
  defaultMultiplier?: string;
  /** Already cooked once, so the button reads as cooking again. */
  made?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={made ? "outline" : "default"}
        className={className}
        onClick={() => setOpen(true)}
      >
        {made ? "Made it again" : "Made it"}
      </Button>
      <MadeItSheet
        recipeId={recipeId}
        recipeName={recipeName}
        weekId={weekId}
        defaultMultiplier={defaultMultiplier}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
