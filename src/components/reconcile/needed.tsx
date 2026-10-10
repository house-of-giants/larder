import { Fragment } from "react";
import { Amount } from "#/components/kit/amount";

export type NeededAmount = { quantityText: string; unit: string };
export type NeededPart = { text: string } | { amount: NeededAmount };

/**
 * "The week needs 22 tbsp" in pieces: the words, then each amount whole (so the row can
 * set it through `Amount`), split units joined by "and" ("1 tbsp and 2 tsp").
 */
export function neededParts(required: readonly NeededAmount[]): NeededPart[] {
  return required.reduce<NeededPart[]>(
    (parts, amount, index) => [...parts, ...(index > 0 ? [{ text: " and " }] : []), { amount }],
    [{ text: "The week needs " }],
  );
}

/** The sentence as the reconcile row shows it, each amount set through `Amount`. */
export function NeededText({ required }: { required: readonly NeededAmount[] }) {
  return (
    <>
      {neededParts(required).map((part, index) => (
        <Fragment key={index}>
          {"text" in part ? (
            part.text
          ) : (
            <Amount quantityText={part.amount.quantityText} unit={part.amount.unit} />
          )}
        </Fragment>
      ))}
    </>
  );
}
