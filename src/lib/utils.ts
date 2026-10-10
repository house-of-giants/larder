import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type roles from src/styles.css, so `text-caption` merges as a size, not a color.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["display", "title", "body", "subhead", "caption", "label"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
