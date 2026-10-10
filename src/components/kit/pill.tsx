import type { ComponentProps } from "react";
import { Button } from "#/components/ui/button";

const variants = {
  primary: "pill",
  pale: "pill-pale",
  outline: "pill-outline",
  text: "pill-text",
} as const;

/**
 * DESIGN.md's pills, 44px and fully round: `primary` is the one tomato control on a
 * screen, `pale` the accent at half strength, `outline` the second action, `text` an
 * inline action in tomato ink. `sheet` is the full-width 50px primary in a sheet footer.
 */
export function Pill({
  variant = "primary",
  sheet = false,
  ...props
}: Omit<ComponentProps<typeof Button>, "variant" | "size"> & {
  variant?: keyof typeof variants;
  sheet?: boolean;
}) {
  return <Button variant={variants[variant]} size={sheet ? "pill-sheet" : "pill"} {...props} />;
}
