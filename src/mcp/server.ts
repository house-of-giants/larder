import { McpServer } from "@modelcontextprotocol/server";
import type { LarderBackend } from "./backend";
import { registerLarderTools } from "./tools";

export const instructions = [
  "Larder keeps one household's pantry, recipes, weekly plan, shopping list, and leftovers.",
  "A week runs weeks_current (or weeks_create), then weeks_set_recipes, list_generate, list_set_item_status as things are bought, cook_made for each recipe cooked, and week_closeout, which settles the leftovers and opens the next week.",
  'Quantities are the recipe\'s own words (quantityText, like "1/2") with an optional decimal beside them for math, units are free text, and nothing is ever converted from one unit to another.',
].join(" ");

/** One server per request (the handler is stateless), bound to one household's backend. */
export function createLarderServer(backend: LarderBackend): McpServer {
  const server = new McpServer({ name: "larder", version: "1.0.0" }, { instructions });
  registerLarderTools(server, backend);
  return server;
}
