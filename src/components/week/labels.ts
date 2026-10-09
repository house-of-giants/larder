import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";
import { amountText } from "#/components/recipes/recipe-text";

export type CurrentWeek = NonNullable<FunctionReturnType<typeof api.weeks.current>>;
export type WeekStatus = CurrentWeek["status"];
export type WeekRecipe = CurrentWeek["recipes"][number];
export type WeekRecipeStatus = WeekRecipe["status"];
export type Adaptation = CurrentWeek["adaptations"][number];

export const weekStatusLabels: Record<WeekStatus, string> = {
  planning: "Planning",
  shopping: "Shopping",
  cooking: "Cooking",
  active: "Eating",
  closed: "Closed",
};

export const adaptationKindLabels: Record<Adaptation["kind"], string> = {
  replace: "Swap an ingredient",
  add: "Add an ingredient",
  remove: "Leave one out",
  adjust: "Change an amount",
};

/** One plain line for an adaptation: "Swap smoked chicken sausage for 2 lb elk sausage". */
export function adaptationText(a: Adaptation): string {
  const amount = a.quantityText ? amountText(a.quantityText, a.unit ?? "") : "";
  const withAmount = (name: string | undefined) =>
    [amount, name ?? "an ingredient"].filter((part) => part !== "").join(" ");
  switch (a.kind) {
    case "replace":
      return `Swap ${a.originalName ?? "an ingredient"} for ${withAmount(a.newName)}`;
    case "add":
      return `Add ${withAmount(a.newName)}`;
    case "remove":
      return `Leave out ${a.originalName ?? "an ingredient"}`;
    case "adjust":
      return `Use ${withAmount(a.originalName)}`;
  }
}
