import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

export type Leftover = FunctionReturnType<typeof api.leftovers.list>[number];

export const placeLabels: Record<Leftover["location"], string> = {
  fridge: "Fridge",
  freezer: "Freezer",
};
