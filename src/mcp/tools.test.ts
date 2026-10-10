import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { afterEach, describe, expect, it } from "vitest";
import type { LarderBackend } from "./backend";
import { createLarderServer, instructions } from "./server";

// Every tool, driven through the real MCP handler and client over an in-memory fetch, with
// an in-memory backend standing in for Convex. A tool whose structuredContent did not match
// its outputSchema would come back isError, so a clean result proves the match.

const ids = {
  ingredient: "ing_eggs",
  pantryItem: "pan_eggs",
  recipe: "rec_sliders",
  week: "wk_1",
  weekRecipe: "wr_1",
  list: "lst_1",
  listItem: "li_1",
  cook: "ck_1",
  food: "pf_1",
  token: "tok_1",
  event: "ev_1",
};

const eggsRow = {
  pantryItemId: ids.pantryItem,
  ingredientId: ids.ingredient,
  name: "eggs",
  kind: "count" as const,
  category: "dairy_eggs",
  location: "fridge" as const,
  count: { quantityText: "6", quantityDecimal: 6, unit: "each" },
  updatedAt: 1,
};
const oilRow = {
  ...eggsRow,
  pantryItemId: "pan_oil",
  ingredientId: "ing_oil",
  name: "olive oil",
  kind: "level" as const,
  location: "pantry" as const,
  count: undefined,
  level: "out" as const,
};
const ingredientDoc = {
  _id: ids.ingredient,
  _creationTime: 1,
  householdId: "hh_secret",
  name: "eggs",
  kind: "count" as const,
  category: "dairy_eggs",
  aliases: ["egg"],
  tracked: true,
  needsReview: false,
};
const week = {
  _id: ids.week,
  weekOf: "2026-10-09",
  status: "planning" as const,
  sourceUrls: [],
  createdAt: 1,
  recipes: [
    {
      weekRecipeId: ids.weekRecipe,
      recipeId: ids.recipe,
      name: "Sliders",
      status: "selected" as const,
      multiplier: { text: "1", decimal: 1 },
      yield: { quantityText: "12", quantityDecimal: 12, unit: "sliders" },
    },
  ],
  adaptations: [],
};
const item = (status: "needed" | "onHand", n: number) => ({
  _id: `${ids.listItem}_${n}`,
  source: "plan" as const,
  ingredientId: ids.ingredient,
  displayName: `thing ${n}`,
  category: "produce",
  kind: "count" as const,
  required: { quantityText: "1", quantityDecimal: 1, unit: "each" },
  status,
  sourceRecipeIds: [ids.recipe],
});
// 12 items, 9 of them already on hand: the summary the brief quotes.
const list = {
  listId: ids.list,
  weekId: ids.week,
  weekOf: "2026-10-09",
  status: "active" as const,
  generatedAt: 1,
  sections: [
    { category: "produce", items: Array.from({ length: 3 }, (_, n) => item("needed", n)) },
    { category: "pantry", items: Array.from({ length: 9 }, (_, n) => item("onHand", n + 3)) },
  ],
};
const leftover = {
  _id: ids.food,
  name: "Sliders",
  recipeId: ids.recipe,
  recipeName: "Sliders",
  weekId: ids.week,
  starting: { text: "12", decimal: 12 },
  remaining: { text: "12", decimal: 12 },
  unit: "sliders",
  location: "fridge" as const,
  madeAt: 1,
};

type Calls = { method: keyof LarderBackend; args: unknown }[];

/** Canned answers shaped like the Convex agent functions' return values. */
function fakeBackend(calls: Calls): LarderBackend {
  const answers: { [K in keyof LarderBackend]: Awaited<ReturnType<LarderBackend[K]>> } = {
    pantryList: [eggsRow, oilRow],
    pantrySetCount: eggsRow,
    pantrySetLevel: { ...oilRow, level: "full" },
    pantryMarkOut: oilRow,
    ingredientsList: [ingredientDoc, { ...ingredientDoc, _id: "ing_x", needsReview: true }],
    ingredientsResolve: {
      kind: "none",
      candidates: [
        { ingredientId: "ing_dijon", name: "Dijon mustard" },
        { ingredientId: "ing_grain", name: "whole-grain mustard" },
      ],
    },
    ingredientsUpsert: ingredientDoc,
    recipesList: [
      {
        _id: ids.recipe,
        name: "Sliders",
        ingredientCount: 6,
        tags: [],
        needsReview: false,
      },
    ],
    recipesGet: {
      _id: ids.recipe,
      _creationTime: 1,
      householdId: "hh_secret",
      name: "Sliders",
      instructions: ["Bake"],
      tags: [],
      needsReview: false,
      updatedAt: 1,
      ingredients: [
        {
          _id: "ri_1",
          order: 0,
          ingredientId: ids.ingredient,
          ingredientName: "eggs",
          ingredientKind: "count",
          quantityText: "2",
          quantityDecimal: 2,
          unit: "each",
          optional: false,
          needsReview: false,
        },
      ],
    },
    recipesUpsert: {
      recipeId: ids.recipe,
      createdIngredients: [
        {
          ingredientId: "ing_new",
          name: "mustard",
          candidates: [{ ingredientId: "ing_dijon", name: "Dijon mustard" }],
        },
      ],
    },
    recipesArchive: null,
    weeksCurrent: week,
    weeksCreate: week,
    weeksSetRecipes: week,
    weeksAddAdaptation: "wa_1",
    weeksSetStatus: null,
    listGet: list,
    listGenerate: list,
    listAddItem: "li_new",
    listSetItemStatus: null,
    cookMade: {
      cookingEventId: ids.cook,
      recipeName: "Sliders",
      preparedFood: {
        preparedFoodId: ids.food,
        name: "Sliders",
        remaining: { text: "12", decimal: 12 },
        unit: "sliders",
        location: "fridge",
      },
      deductions: [
        {
          ingredientId: ids.ingredient,
          name: "eggs",
          kind: "count",
          unit: "each",
          before: 6,
          after: 4,
          used: 2,
          wentNegative: false,
        },
        {
          ingredientId: "ing_oil",
          name: "olive oil",
          kind: "level",
          before: "low",
          after: "out",
          wentNegative: true,
        },
      ],
    },
    leftoversList: [leftover],
    leftoversConsume: { remaining: { text: "11", decimal: 11 }, status: "available" },
    leftoversDiscard: null,
    weekCloseout: { ...week, _id: "wk_2", weekOf: "2026-10-16", recipes: [] },
    eventsRecent: [
      {
        _id: ids.event,
        _creationTime: 1,
        householdId: "hh_secret",
        type: "purchase",
        at: 1,
        actor: { kind: "token", tokenId: ids.token },
        refs: { listItemId: ids.listItem },
        payload: { before: null, after: { ingredientId: ids.ingredient } },
      },
    ],
  } as never;
  return Object.fromEntries(
    Object.entries(answers).map(([method, answer]) => [
      method,
      async (args: unknown) => {
        calls.push({ method: method as keyof LarderBackend, args });
        return answer;
      },
    ]),
  ) as unknown as LarderBackend;
}

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

async function connect(backend: LarderBackend) {
  const handler = createMcpHandler(() => createLarderServer(backend));
  const client = new Client(
    { name: "tools-test", version: "1.0.0" },
    { versionNegotiation: { mode: "auto" } },
  );
  const transport = new StreamableHTTPClientTransport(new URL("http://test.local/mcp"), {
    fetch: (url, init) => handler.fetch(new Request(url, init)),
  });
  await client.connect(transport);
  close = async () => {
    await client.close();
    await handler.close();
  };
  return client;
}

type Case = {
  tool: string;
  /** Valid arguments; the backend method they reach; what the summary says. */
  args: Record<string, unknown>;
  calls: (keyof LarderBackend)[];
  summary: string;
  /** Arguments the input schema must refuse. */
  bad: Record<string, unknown>;
};

const cases: Case[] = [
  {
    tool: "pantry_list",
    args: {},
    calls: ["pantryList"],
    summary: "2 things in the pantry, 1 out.",
    bad: { extra: 1 },
  },
  {
    tool: "pantry_set",
    args: { ingredientId: ids.ingredient, quantityText: "6", unit: "each" },
    calls: ["pantrySetCount"],
    summary: "eggs: 6 each, in the fridge.",
    bad: { ingredientId: 7, quantityText: "6" },
  },
  {
    tool: "pantry_mark_out",
    args: { ingredientId: "ing_oil" },
    calls: ["pantryMarkOut"],
    summary: "olive oil is out.",
    bad: {},
  },
  {
    tool: "ingredients_list",
    args: {},
    calls: ["ingredientsList"],
    summary: "2 ingredients, 1 needing review.",
    bad: { extra: true },
  },
  {
    tool: "ingredients_resolve",
    args: { name: "mustard" },
    calls: ["ingredientsResolve"],
    summary: 'No match for "mustard"; 2 candidates: Dijon mustard, whole-grain mustard.',
    bad: { name: ["mustard"] },
  },
  {
    tool: "ingredients_upsert",
    args: { name: "eggs", kind: "count", category: "dairy_eggs", aliases: [], tracked: true },
    calls: ["ingredientsUpsert"],
    summary: "Saved eggs.",
    bad: { name: "eggs", kind: "dozen", category: "dairy_eggs", aliases: [], tracked: true },
  },
  {
    tool: "recipes_list",
    args: {},
    calls: ["recipesList"],
    summary: "1 recipe.",
    bad: { includeArchived: "yes" },
  },
  {
    tool: "recipes_get",
    args: { id: ids.recipe },
    calls: ["recipesGet"],
    summary: "Sliders: 1 ingredient.",
    bad: {},
  },
  {
    tool: "recipes_upsert",
    args: {
      name: "Sliders",
      ingredients: [{ name: "mustard", quantityText: "1", unit: "tsp" }],
    },
    calls: ["recipesUpsert"],
    summary: "Saved Sliders; 1 new ingredient to review: mustard.",
    bad: { name: "Sliders", ingredients: [{ quantityText: "1", unit: "tsp" }] },
  },
  {
    tool: "recipes_archive",
    args: { id: ids.recipe },
    calls: ["recipesArchive"],
    summary: "Recipe archived.",
    bad: { id: "" },
  },
  {
    tool: "weeks_current",
    args: {},
    calls: ["weeksCurrent"],
    summary: "Week of 2026-10-09, planning: 1 recipe selected.",
    bad: { weekId: 1 },
  },
  {
    tool: "weeks_create",
    args: { weekOf: "2026-10-09" },
    calls: ["weeksCreate"],
    summary: "Week of 2026-10-09, planning: 1 recipe selected.",
    bad: { sourceUrls: ["https://x.test"] },
  },
  {
    tool: "weeks_set_recipes",
    args: { weekId: ids.week, recipes: [{ recipeId: ids.recipe }] },
    calls: ["weeksSetRecipes"],
    summary: "Week of 2026-10-09, planning: 1 recipe selected.",
    bad: { weekId: ids.week, recipes: [] },
  },
  {
    tool: "weeks_add_adaptation",
    args: {
      weekId: ids.week,
      recipeId: ids.recipe,
      kind: "remove",
      originalIngredientId: ids.ingredient,
      description: "No eggs",
    },
    calls: ["weeksAddAdaptation"],
    summary: "Adaptation added: No eggs",
    bad: { weekId: ids.week, recipeId: ids.recipe, kind: "swap", description: "x" },
  },
  {
    tool: "weeks_set_status",
    args: { weekId: ids.week, status: "cooking" },
    calls: ["weeksSetStatus"],
    summary: "The week is cooking.",
    bad: { weekId: ids.week, status: "done" },
  },
  {
    tool: "list_get",
    args: {},
    calls: ["listGet"],
    summary: "12 items on the list, 9 already on hand.",
    bad: { listId: 3 },
  },
  {
    tool: "list_generate",
    args: { weekId: ids.week },
    calls: ["listGenerate"],
    summary: "12 items on the list, 9 already on hand.",
    bad: {},
  },
  {
    tool: "list_add_item",
    args: { displayName: "paper towels" },
    calls: ["listAddItem"],
    summary: "Added paper towels to the list.",
    bad: { quantityText: "2" },
  },
  {
    tool: "list_set_item_status",
    args: { listItemId: ids.listItem, status: "checked" },
    calls: ["listSetItemStatus"],
    summary: "Item checked.",
    bad: { listItemId: ids.listItem, status: "onHand" },
  },
  {
    tool: "cook_made",
    args: { recipeId: ids.recipe },
    calls: ["cookMade"],
    summary:
      "Made Sliders: 2 ingredients taken from the pantry (1 ran short), 12 sliders in the fridge.",
    bad: { recipeId: ids.recipe, skippedIngredientIds: "eggs" },
  },
  {
    tool: "leftovers_list",
    args: {},
    calls: ["leftoversList"],
    summary: "Leftovers: 12 sliders Sliders.",
    bad: { location: 2 },
  },
  {
    tool: "leftovers_consume",
    args: { preparedFoodId: ids.food, quantityText: "1" },
    calls: ["leftoversConsume"],
    summary: "11 left.",
    bad: { quantityText: "1" },
  },
  {
    tool: "leftovers_discard",
    args: { preparedFoodId: ids.food },
    calls: ["leftoversDiscard"],
    summary: "Tossed.",
    bad: { preparedFoodId: null },
  },
  {
    tool: "week_closeout",
    args: { weekId: ids.week, decisions: [{ preparedFoodId: ids.food, outcome: "keep" }] },
    calls: ["weekCloseout"],
    summary: "Week closed. Next: week of 2026-10-16, planning.",
    bad: { weekId: ids.week, decisions: [{ preparedFoodId: ids.food, outcome: "frozen" }] },
  },
  {
    tool: "events_recent",
    args: { limit: 5 },
    calls: ["eventsRecent"],
    summary: "1 event.",
    bad: { limit: 0 },
  },
];

describe("the MCP tool surface", () => {
  it("lists exactly the 25 tools, each fully described and annotated", async () => {
    const client = await connect(fakeBackend([]));
    expect(client.getInstructions()).toBe(instructions);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(cases.map((c) => c.tool).sort());
    expect(tools).toHaveLength(25);

    // Every gap, named, so a failure says which tool and field.
    const gaps: string[] = [];
    for (const tool of tools) {
      if (!tool.description) gaps.push(`${tool.name}: no description`);
      if (tool.outputSchema?.type !== "object") gaps.push(`${tool.name}: no object outputSchema`);
      if (typeof tool.annotations?.readOnlyHint !== "boolean") {
        gaps.push(`${tool.name}: no readOnlyHint`);
      }
      if (tool.annotations?.openWorldHint !== false) gaps.push(`${tool.name}: open world`);
      const properties = (tool.inputSchema.properties ?? {}) as Record<
        string,
        { description?: string }
      >;
      for (const [field, schema] of Object.entries(properties)) {
        if (!schema.description) gaps.push(`${tool.name}.${field}: no description`);
      }
    }
    expect(gaps).toEqual([]);

    const destructive = tools
      .filter((t) => t.annotations?.destructiveHint === true)
      .map((t) => t.name)
      .sort();
    // Anything that takes inventory away, or replaces or clears what was saved, is destructive.
    expect(destructive).toEqual([
      "cook_made",
      "ingredients_upsert",
      "leftovers_consume",
      "leftovers_discard",
      "pantry_mark_out",
      "recipes_archive",
      "recipes_upsert",
      "week_closeout",
    ]);
    // Idempotent only where a repeat changes nothing and writes no new ledger event.
    const idempotent = tools
      .filter((t) => t.annotations?.idempotentHint === true)
      .map((t) => t.name)
      .sort();
    expect(idempotent).toEqual([
      "ingredients_upsert",
      "list_generate",
      "list_set_item_status",
      "recipes_archive",
      "weeks_set_recipes",
      "weeks_set_status",
    ]);
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint).map((t) => t.name);
    expect(readOnly.sort()).toEqual(
      [
        "events_recent",
        "ingredients_list",
        "ingredients_resolve",
        "leftovers_list",
        "list_get",
        "pantry_list",
        "recipes_get",
        "recipes_list",
        "weeks_current",
      ].sort(),
    );
  });

  it.each(cases)("$tool returns structuredContent and a one-line summary", async (c) => {
    const calls: Calls = [];
    const client = await connect(fakeBackend(calls));
    const result = await client.callTool({ name: c.tool, arguments: c.args });
    // The whole result is printed if this fails, error text included.
    expect(result).not.toHaveProperty("isError", true);
    expect(result.structuredContent).toEqual(expect.any(Object));
    expect(result.content).toEqual([{ type: "text", text: c.summary }]);
    expect(calls.map((call) => call.method)).toEqual(c.calls);
    // Internal fields never leave, even when the backend returns them.
    expect(JSON.stringify(result.structuredContent)).not.toContain("hh_secret");
  });

  it.each(cases)("$tool refuses arguments its input schema does not allow", async (c) => {
    const calls: Calls = [];
    const client = await connect(fakeBackend(calls));
    const result = await client.callTool({ name: c.tool, arguments: c.bad });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Input validation error");
    expect(calls).toEqual([]);
  });
});

describe("pantry_set", () => {
  it("sets a level through the level path", async () => {
    const calls: Calls = [];
    const client = await connect(fakeBackend(calls));
    const result = await client.callTool({
      name: "pantry_set",
      arguments: { ingredientId: "ing_oil", level: "full" },
    });
    expect(result.content).toEqual([{ type: "text", text: "olive oil: full, in the pantry." }]);
    expect(calls).toEqual([
      { method: "pantrySetLevel", args: { ingredientId: "ing_oil", level: "full" } },
    ]);
  });

  it("refuses both a count and a level, and neither", async () => {
    const calls: Calls = [];
    const client = await connect(fakeBackend(calls));
    for (const extra of [{ quantityText: "2", level: "full" }, {}]) {
      const result = await client.callTool({
        name: "pantry_set",
        arguments: { ingredientId: ids.ingredient, ...extra },
      });
      expect(result.isError).toBe(true);
      expect(result.content).toEqual([
        {
          type: "text",
          text: "Send either quantityText (a count) or level, not both or neither.",
        },
      ]);
    }
    expect(calls).toEqual([]);
  });
});

describe("tool errors", () => {
  it("passes a backend refusal through as an isError result in its own words", async () => {
    const backend = fakeBackend([]);
    backend.weeksCreate = async () => {
      throw new Error("Close the current week first.");
    };
    const client = await connect(backend);
    const result = await client.callTool({
      name: "weeks_create",
      arguments: { weekOf: "2026-10-16" },
    });
    expect(result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: "Close the current week first." }],
    });
  });
});
