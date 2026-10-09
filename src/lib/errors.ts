import { ConvexError } from "convex/values";

/** Plain words for the person: a ConvexError's own message, or a generic retry line. */
export function errorMessage(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return "That did not go through. Try again.";
}
