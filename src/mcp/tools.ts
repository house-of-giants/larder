import type { McpServer, ToolAnnotations } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { Id, TableNames } from "../../convex/_generated/dataModel";
import type { LarderBackend } from "./backend";

// The 25 tools of the MCP door. Each one validates its input, calls one backend method (or
// two, where a write answers with the state it left), and returns structuredContent that
// matches its outputSchema plus a one-line summary. The server does arithmetic and alias
// matching only; anything that needs judgment is the agent's.

// Inputs ---------------------------------------------------------------------------------
// Tool inputs are strict objects: a misspelled argument is refused, not quietly dropped.

/** A Convex id from an earlier tool's output; typed for the backend, a string on the wire. */
const id = <T extends TableNames>(_table: T, description: string) =>
  z.string().min(1).describe(description) as unknown as z.ZodType<Id<T>>;

const levelValues = ["full", "half", "low", "out"] as const;
const locationValues = ["pantry", "fridge", "freezer", "counter"] as const;
const weekStatusValues = ["planning", "shopping", "cooking", "active", "closed"] as const;

const quantityText = (what: string) =>
  z
    .string()
    .describe(`${what}, in the recipe's own words: "2", "1/2", "1 1/2", "0.25". Never converted.`);

// Outputs --------------------------------------------------------------------------------

const quantity = z.object({
  quantityText: z.string(),
  quantityDecimal: z.number().optional(),
  unit: z.string(),
});
const count = z.object({ quantityText: z.string(), quantityDecimal: z.number(), unit: z.string() });
const amount = z.object({ text: z.string(), decimal: z.number() });
const kind = z.enum(["count", "level"]);
const level = z.enum(levelValues);

// A pantry row is a count or a level, never both.
const shelf = {
  pantryItemId: z.string(),
  ingredientId: z.string(),
  name: z.string(),
  category: z.string(),
  location: z.enum(locationValues),
  purchaseNote: z.string().optional(),
  updatedAt: z.number(),
};
const pantryItem = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("count"), count, ...shelf }),
  z.object({ kind: z.literal("level"), level, ...shelf }),
]);

const ingredient = z.object({
  _id: z.string(),
  name: z.string(),
  kind,
  category: z.string(),
  defaultUnit: z.string().optional(),
  aliases: z.array(z.string()),
  tracked: z.boolean(),
  notes: z.string().optional(),
  needsReview: z.boolean(),
});

const namedIngredient = z.object({ ingredientId: z.string(), name: z.string() });

const recipeYield = quantity.optional();
const recipeSummary = z.object({
  _id: z.string(),
  name: z.string(),
  ingredientCount: z.number(),
  yield: recipeYield,
  tags: z.array(z.string()),
  needsReview: z.boolean(),
  archivedAt: z.number().optional(),
});

const recipe = z.object({
  _id: z.string(),
  name: z.string(),
  source: z
    .object({
      type: z.string(),
      title: z.string().optional(),
      url: z.string().optional(),
      author: z.string().optional(),
      date: z.string().optional(),
    })
    .optional(),
  yield: recipeYield,
  freezerFriendly: z.boolean().optional(),
  storageNotes: z.string().optional(),
  reheatingNotes: z.string().optional(),
  instructions: z.array(z.string()),
  tags: z.array(z.string()),
  needsReview: z.boolean(),
  archivedAt: z.number().optional(),
  updatedAt: z.number(),
  ingredients: z.array(
    z.object({
      _id: z.string(),
      order: z.number(),
      ingredientId: z.string(),
      ingredientName: z.string(),
      ingredientKind: kind,
      displayName: z.string().optional(),
      quantityText: z.string(),
      quantityDecimal: z.number().optional(),
      unit: z.string(),
      optional: z.boolean(),
      preparation: z.string().optional(),
      deductionIngredientId: z.string().optional(),
      deductionNote: z.string().optional(),
      needsReview: z.boolean(),
    }),
  ),
});

const week = z.object({
  _id: z.string(),
  weekOf: z.string(),
  status: z.enum(weekStatusValues),
  sourceUrls: z.array(z.string()),
  notes: z.string().optional(),
  createdAt: z.number(),
  recipes: z.array(
    z.object({
      weekRecipeId: z.string(),
      recipeId: z.string(),
      name: z.string(),
      status: z.enum(["candidate", "selected", "skipped"]),
      multiplier: amount,
      yield: recipeYield,
    }),
  ),
  adaptations: z.array(
    z.object({
      _id: z.string(),
      recipeId: z.string(),
      kind: z.enum(["replace", "add", "remove", "adjust"]),
      description: z.string(),
      originalIngredientId: z.string().optional(),
      originalName: z.string().optional(),
      newIngredientId: z.string().optional(),
      newName: z.string().optional(),
      quantityText: z.string().optional(),
      quantityDecimal: z.number().optional(),
      unit: z.string().optional(),
    }),
  ),
});

const listItemStatus = z.enum(["needed", "checked", "skipped", "onHand"]);
const list = z.object({
  listId: z.string(),
  weekId: z.string(),
  weekOf: z.string(),
  status: z.enum(["draft", "active", "complete"]),
  generatedAt: z.number(),
  sections: z.array(
    z.object({
      category: z.string(),
      items: z.array(
        z.object({
          _id: z.string(),
          source: z.enum(["plan", "adhoc"]),
          ingredientId: z.string().optional(),
          displayName: z.string(),
          category: z.string(),
          kind,
          required: quantity,
          purchase: quantity.extend({ note: z.string().optional() }).optional(),
          status: listItemStatus,
          checkedAt: z.number().optional(),
          sourceRecipeIds: z.array(z.string()),
        }),
      ),
    }),
  ),
});

const foodStatus = z.enum(["available", "consumed", "discarded"]);
const leftover = z.object({
  _id: z.string(),
  name: z.string(),
  recipeId: z.string(),
  recipeName: z.string().optional(),
  weekId: z.string().optional(),
  starting: amount,
  remaining: amount,
  unit: z.string(),
  location: z.enum(["fridge", "freezer"]),
  madeAt: z.number(),
});

const deduction = z.discriminatedUnion("kind", [
  z.object({
    ingredientId: z.string(),
    name: z.string(),
    kind: z.literal("count"),
    unit: z.string(),
    before: z.number().nullable(),
    after: z.number().nullable(),
    used: z.number().nullable(),
    wentNegative: z.boolean(),
    note: z.enum(["no decimal", "unit mismatch"]).optional(),
  }),
  z.object({
    ingredientId: z.string(),
    name: z.string(),
    kind: z.literal("level"),
    before: level.nullable(),
    after: level.nullable(),
    wentNegative: z.boolean(),
  }),
]);

const inventoryEvent = z.object({
  _id: z.string(),
  type: z.enum([
    "purchase",
    "deduction",
    "adjustment",
    "consumption",
    "discard",
    "closeout",
    "undo",
  ]),
  at: z.number(),
  actor: z.union([
    z.object({ kind: z.literal("member"), memberId: z.string() }),
    z.object({ kind: z.literal("token"), tokenId: z.string() }),
  ]),
  refs: z.object({
    pantryItemId: z.string().optional(),
    listItemId: z.string().optional(),
    cookingEventId: z.string().optional(),
    preparedFoodId: z.string().optional(),
  }),
  payload: z.unknown().describe("Before/after snapshot of what the event changed."),
  undoesEventId: z.string().optional(),
});

// Annotations ----------------------------------------------------------------------------

// Every tool touches only this household's Larder data: a closed world.
const read: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
const write = (hints: { destructive?: boolean; idempotent?: boolean } = {}): ToolAnnotations => ({
  readOnlyHint: false,
  destructiveHint: hints.destructive ?? false,
  idempotentHint: hints.idempotent ?? false,
  openWorldHint: false,
});

// Summaries ------------------------------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function listSummary(current: z.infer<typeof list> | null): string {
  if (current === null) return "No list yet. Generate one from the week's recipes.";
  const items = current.sections.flatMap((s) => s.items);
  const onHand = items.filter((i) => i.status === "onHand").length;
  return `${plural(items.length, "item")} on the list, ${onHand} already on hand.`;
}

function weekSummary(current: z.infer<typeof week> | null): string {
  if (current === null) return "No open week. Create one with weeks_create.";
  const selected = current.recipes.filter((r) => r.status === "selected").length;
  return `Week of ${current.weekOf}, ${current.status}: ${plural(selected, "recipe")} selected.`;
}

// Registration ---------------------------------------------------------------------------

type Shape = z.ZodObject;

export function registerLarderTools(server: McpServer, backend: LarderBackend) {
  /** Registers one tool; its output is parsed through the schema, so only declared fields leave. */
  function tool<I extends Shape, O extends Shape>(
    name: string,
    config: { description: string; input: I; output: O; annotations: ToolAnnotations },
    run: (args: z.infer<I>) => Promise<{ data: z.input<O>; summary: string }>,
  ) {
    server.registerTool(
      name,
      {
        description: config.description,
        // Widened from the generics so the SDK's callback type resolves.
        inputSchema: config.input as Shape,
        outputSchema: config.output as Shape,
        annotations: config.annotations,
      },
      // The SDK has validated args against config.input by the time this runs.
      async (args: unknown) => {
        const { data, summary } = await run(args as z.infer<I>);
        return {
          content: [{ type: "text" as const, text: summary }],
          structuredContent: config.output.parse(data) as Record<string, unknown>,
        };
      },
    );
  }

  // Pantry.

  tool(
    "pantry_list",
    {
      description:
        "Everything in the household's pantry, fridge, freezer, and on the counter. Count items carry quantityText, quantityDecimal, and unit; level items carry full, half, low, or out.",
      input: z.strictObject({}),
      output: z.object({ items: z.array(pantryItem) }),
      annotations: read,
    },
    async () => {
      const items = await backend.pantryList({});
      const out = items.filter((i) =>
        i.kind === "level" ? i.level === "out" : i.count.quantityDecimal === 0,
      ).length;
      return {
        data: { items },
        summary: `${plural(items.length, "thing")} in the pantry, ${out} out.`,
      };
    },
  );

  tool(
    "pantry_set",
    {
      description:
        "Sets how much of one ingredient the household has. Send quantityText (and unit) for a count ingredient, or level for a level ingredient; ingredients_list says which kind each is. Recorded in the household's ledger.",
      input: z.strictObject({
        ingredientId: id(
          "ingredients",
          "The ingredient, from ingredients_list or ingredients_resolve.",
        ),
        quantityText: quantityText("How many or how much, for a count ingredient").optional(),
        unit: z
          .string()
          .optional()
          .describe(
            'The unit as written, like "each", "lb", "oz". Defaults to the ingredient\'s default unit.',
          ),
        level: z
          .enum(levelValues)
          .optional()
          .describe("How full it is, for a level ingredient (spices, oils, condiments)."),
        location: z
          .enum(locationValues)
          .optional()
          .describe(
            "Where it lives. Defaults to where it already is, or its category's usual place.",
          ),
      }),
      output: z.object({ item: pantryItem }),
      annotations: write(),
    },
    async ({ ingredientId, quantityText, unit, level, location }) => {
      if ((level === undefined) === (quantityText === undefined)) {
        throw new Error("Send either quantityText (a count) or level, not both or neither.");
      }
      const item =
        level !== undefined
          ? await backend.pantrySetLevel({ ingredientId, level, location })
          : await backend.pantrySetCount({
              ingredientId,
              quantityText: quantityText!,
              unit: unit ?? "",
              location,
            });
      const amountWords =
        item.kind === "level" ? item.level : `${item.count.quantityText} ${item.count.unit}`;
      return { data: { item }, summary: `${item.name}: ${amountWords}, in the ${item.location}.` };
    },
  );

  tool(
    "pantry_mark_out",
    {
      description:
        "Marks an ingredient that is in the pantry as used up: a count goes to 0, a level to out. Recorded in the ledger.",
      input: z.strictObject({
        ingredientId: id("ingredients", "The ingredient, from pantry_list or ingredients_list."),
      }),
      output: z.object({ item: pantryItem }),
      annotations: write({ destructive: true }),
    },
    async ({ ingredientId }) => {
      const item = await backend.pantryMarkOut({ ingredientId });
      return { data: { item }, summary: `${item.name} is out.` };
    },
  );

  // Ingredients.

  tool(
    "ingredients_list",
    {
      description:
        "The household's ingredient dictionary: names, aliases, kind (count or level), category, and whether each needs review.",
      input: z.strictObject({}),
      output: z.object({ ingredients: z.array(ingredient) }),
      annotations: read,
    },
    async () => {
      const ingredients = await backend.ingredientsList({});
      const review = ingredients.filter((i) => i.needsReview).length;
      return {
        data: { ingredients },
        summary: `${plural(ingredients.length, "ingredient")}, ${review} needing review.`,
      };
    },
  );

  tool(
    "ingredients_resolve",
    {
      description:
        'Matches a name to one of the household\'s ingredients by exact name, case, alias, or plural. Never guesses a near spelling: when nothing matches, it returns candidates ("mustard" offers both mustards) for you to choose from.',
      input: z.strictObject({
        name: z.string().describe('The ingredient name as written, like "eggs" or "Dijon".'),
      }),
      output: z.object({
        name: z.string(),
        match: namedIngredient
          .extend({ how: z.enum(["exact", "case", "alias", "plural"]) })
          .nullable(),
        candidates: z.array(namedIngredient),
      }),
      annotations: read,
    },
    async ({ name }) => {
      const result = await backend.ingredientsResolve({ name });
      if (result.kind === "match") {
        const { kind: _kind, ...match } = result;
        return {
          data: { name, match, candidates: [] },
          summary: `"${name}" is ${match.name} (${match.how} match).`,
        };
      }
      return {
        data: { name, match: null, candidates: result.candidates },
        summary:
          result.candidates.length === 0
            ? `No ingredient matches "${name}".`
            : `No match for "${name}"; ${plural(result.candidates.length, "candidate")}: ${result.candidates.map((c) => c.name).join(", ")}.`,
      };
    },
  );

  tool(
    "ingredients_upsert",
    {
      description:
        "Creates an ingredient, or with id replaces one (send every field; ones left out are cleared). Add an alias here to settle a name recipes_upsert could not place.",
      input: z.strictObject({
        id: id("ingredients", "The ingredient to update. Leave out to create one.").optional(),
        name: z.string().describe("The ingredient's name, unique in the household."),
        kind: kind.describe("count for things you count or weigh; level for jars and bottles."),
        category: z
          .string()
          .describe('Store section, like "produce", "dairy_eggs", "meat_seafood", "other".'),
        defaultUnit: z.string().optional().describe('The usual unit, like "each" or "lb".'),
        aliases: z
          .array(z.string())
          .describe("Other names that mean this ingredient. Send the whole list."),
        tracked: z.boolean().describe("Whether the pantry keeps track of it."),
        notes: z.string().optional().describe("Free text for the household."),
      }),
      output: z.object({ ingredient }),
      annotations: write({ destructive: true, idempotent: true }),
    },
    async (args) => {
      const saved = await backend.ingredientsUpsert(args);
      return { data: { ingredient: saved }, summary: `Saved ${saved.name}.` };
    },
  );

  // Recipes.

  tool(
    "recipes_list",
    {
      description: "The household's recipes, with ingredient counts and yields.",
      input: z.strictObject({
        includeArchived: z.boolean().optional().describe("Include archived recipes too."),
      }),
      output: z.object({ recipes: z.array(recipeSummary) }),
      annotations: read,
    },
    async (args) => {
      const recipes = await backend.recipesList(args);
      return { data: { recipes }, summary: `${plural(recipes.length, "recipe")}.` };
    },
  );

  tool(
    "recipes_get",
    {
      description:
        "One recipe in full: source, yield, instructions, and each ingredient row in the recipe's own words.",
      input: z.strictObject({ id: z.string().describe("The recipe id, from recipes_list.") }),
      output: z.object({ recipe: recipe.nullable() }),
      annotations: read,
    },
    async (args) => {
      const found = await backend.recipesGet(args);
      return {
        data: { recipe: found },
        summary:
          found === null
            ? "No such recipe here."
            : `${found.name}: ${plural(found.ingredients.length, "ingredient")}.`,
      };
    },
  );

  tool(
    "recipes_upsert",
    {
      description:
        "Saves a recipe from ingredient names. Each name goes through the alias resolver; a name it cannot place becomes a new ingredient marked needsReview and is listed in createdIngredients, with candidates when the resolver found close ones. Fix those with ingredients_upsert. With id, replaces that recipe's fields and rows.",
      input: z.strictObject({
        id: id("recipes", "The recipe to replace. Leave out to create one.").optional(),
        name: z.string().describe("The recipe's name."),
        source: z
          .object({
            type: z.string().describe('Where it came from, like "substack" or "manual".'),
            title: z.string().optional().describe("The source's title."),
            url: z.string().optional().describe("An http(s) link to the source."),
            author: z.string().optional().describe("Who wrote it."),
            date: z.string().optional().describe("When it was published, as written."),
          })
          .optional()
          .describe("Where the recipe came from."),
        yield: z
          .object({
            quantityText: quantityText("How much it makes"),
            unit: z.string().describe('What it makes, like "sliders" or "servings".'),
          })
          .optional()
          .describe("What one batch makes; cook_made puts this in the fridge as leftovers."),
        freezerFriendly: z.boolean().optional().describe("Whether it freezes well."),
        storageNotes: z.string().optional().describe("How to store it."),
        reheatingNotes: z.string().optional().describe("How to reheat it."),
        instructions: z.array(z.string()).default([]).describe("The steps, in order."),
        tags: z.array(z.string()).default([]).describe('Labels like "breakfast".'),
        needsReview: z
          .boolean()
          .optional()
          .describe("Flag the recipe for a person to check. Set when any name was not resolved."),
        ingredients: z
          .array(
            z.object({
              name: z.string().describe("The ingredient's name; resolved, never guessed."),
              displayName: z
                .string()
                .optional()
                .describe("How the recipe words it, when that differs from the name."),
              quantityText: quantityText("The amount"),
              unit: z.string().describe('The unit as written, like "cup", "each", "tsp".'),
              optional: z.boolean().optional().describe("Whether the recipe calls it optional."),
              preparation: z.string().optional().describe('Like "shredded" or "diced".'),
              deductionNote: z.string().optional().describe("A note on what the pantry loses."),
            }),
          )
          .describe("The rows, in recipe order."),
      }),
      output: z.object({
        recipeId: z.string(),
        createdIngredients: z.array(
          namedIngredient.extend({
            candidates: z
              .array(namedIngredient)
              .describe("Existing ingredients close to the name; empty when none were."),
          }),
        ),
      }),
      annotations: write({ destructive: true }),
    },
    async (args) => {
      const result = await backend.recipesUpsert(args);
      const created = result.createdIngredients;
      return {
        data: result,
        summary:
          created.length === 0
            ? `Saved ${args.name}; every ingredient resolved.`
            : `Saved ${args.name}; ${plural(created.length, "new ingredient")} to review: ${created.map((c) => c.name).join(", ")}.`,
      };
    },
  );

  tool(
    "recipes_archive",
    {
      description:
        "Archives a recipe: it leaves the recipe list but weeks and cooks that used it keep pointing at it.",
      input: z.strictObject({ id: id("recipes", "The recipe, from recipes_list.") }),
      output: z.object({ recipeId: z.string(), archived: z.literal(true) }),
      annotations: write({ destructive: true, idempotent: true }),
    },
    async ({ id: recipeId }) => {
      await backend.recipesArchive({ id: recipeId });
      return { data: { recipeId, archived: true as const }, summary: "Recipe archived." };
    },
  );

  // Weeks.

  tool(
    "weeks_current",
    {
      description:
        "The household's open week: its status (planning, shopping, cooking, active), recipes with multipliers, and adaptations. Null when there is none.",
      input: z.strictObject({}),
      output: z.object({ week: week.nullable() }),
      annotations: read,
    },
    async () => {
      const current = await backend.weeksCurrent({});
      return { data: { week: current }, summary: weekSummary(current) };
    },
  );

  tool(
    "weeks_create",
    {
      description:
        "Opens a new week in planning. Only one week can be open; close the current one with week_closeout first.",
      input: z.strictObject({
        weekOf: z.string().describe("The week's first day, YYYY-MM-DD."),
        sourceUrls: z
          .array(z.string())
          .optional()
          .describe("http(s) links the week's plan came from."),
      }),
      output: z.object({ week }),
      annotations: write(),
    },
    async (args) => {
      const created = await backend.weeksCreate(args);
      if (created === null) throw new Error("The week was not created.");
      return { data: { week: created }, summary: weekSummary(created) };
    },
  );

  tool(
    "weeks_set_recipes",
    {
      description:
        "Adds recipes to a week or changes them: selected recipes go on the list, candidates and skipped ones do not. Works while the week is planning or shopping; regenerate the list after.",
      input: z.strictObject({
        weekId: id("weeks", "The week, from weeks_current."),
        recipes: z
          .array(
            z.object({
              recipeId: id("recipes", "The recipe, from recipes_list."),
              status: z
                .enum(["candidate", "selected", "skipped"])
                .default("selected")
                .describe("selected cooks it this week; candidate or skipped do not."),
              multiplierText: z
                .string()
                .optional()
                .describe('Batches to make, like "1", "1/2", "2". Unchanged when left out.'),
            }),
          )
          .min(1)
          .describe("The recipes to set."),
      }),
      output: z.object({ week }),
      annotations: write({ idempotent: true }),
    },
    async (args) => {
      const updated = await backend.weeksSetRecipes(args);
      if (updated === null) throw new Error("That week is not open.");
      return { data: { week: updated }, summary: weekSummary(updated) };
    },
  );

  tool(
    "weeks_add_adaptation",
    {
      description:
        "Changes a recipe for this week only: replace one ingredient with another, add one, remove one, or adjust an amount. The list follows when regenerated.",
      input: z.strictObject({
        weekId: id("weeks", "The week, from weeks_current."),
        recipeId: id("recipes", "The recipe being adapted."),
        kind: z
          .enum(["replace", "add", "remove", "adjust"])
          .describe(
            "replace needs both ingredients; add needs the new one and an amount; remove needs the original; adjust needs the original and an amount.",
          ),
        description: z.string().describe("The change in a few words, for the household."),
        originalIngredientId: id("ingredients", "The ingredient in the recipe.").optional(),
        newIngredientId: id("ingredients", "The ingredient to use instead or add.").optional(),
        quantityText: quantityText("The new amount").optional(),
        unit: z.string().optional().describe("The unit for quantityText."),
      }),
      output: z.object({ adaptationId: z.string() }),
      annotations: write(),
    },
    async (args) => {
      const adaptationId = await backend.weeksAddAdaptation(args);
      return { data: { adaptationId }, summary: `Adaptation added: ${args.description}` };
    },
  );

  tool(
    "weeks_set_status",
    {
      description:
        "Moves a week one step: shopping to cooking, cooking to active, active to closed. list_generate is what moves planning to shopping; week_closeout is the usual way to close.",
      input: z.strictObject({
        weekId: id("weeks", "The week, from weeks_current."),
        status: z.enum(weekStatusValues).describe("The next status."),
      }),
      output: z.object({ weekId: z.string(), status: z.enum(weekStatusValues) }),
      annotations: write({ idempotent: true }),
    },
    async (args) => {
      await backend.weeksSetStatus(args);
      return { data: args, summary: `The week is ${args.status}.` };
    },
  );

  // The list.

  tool(
    "list_get",
    {
      description:
        "The open week's shopping list in store-section order. Each item is needed, checked, skipped, or onHand (the pantry already covers it).",
      input: z.strictObject({}),
      output: z.object({ list: list.nullable() }),
      annotations: read,
    },
    async () => {
      const current = await backend.listGet({});
      return { data: { list: current }, summary: listSummary(current) };
    },
  );

  tool(
    "list_generate",
    {
      description:
        "Builds the week's list from its selected recipes and adaptations, minus what the pantry has. Re-running keeps checked, skipped, and ad-hoc items. Moves a planning week to shopping.",
      input: z.strictObject({ weekId: id("weeks", "The week, from weeks_current.") }),
      output: z.object({ list }),
      annotations: write({ idempotent: true }),
    },
    async (args) => {
      const generated = await backend.listGenerate(args);
      if (generated === null) throw new Error("The list was not generated.");
      return { data: { list: generated }, summary: listSummary(generated) };
    },
  );

  tool(
    "list_add_item",
    {
      description:
        "Adds an ad-hoc item to the open week's list, like paper towels. Ad-hoc items never change the pantry.",
      input: z.strictObject({
        displayName: z.string().describe("What to buy, as it should read on the list."),
        quantityText: quantityText("How many or how much").optional(),
        unit: z.string().optional().describe("The unit for quantityText."),
        category: z.string().optional().describe('Store section; "other" when left out.'),
      }),
      output: z.object({ listItemId: z.string() }),
      annotations: write(),
    },
    async (args) => {
      const listItemId = await backend.listAddItem(args);
      return { data: { listItemId }, summary: `Added ${args.displayName} to the list.` };
    },
  );

  tool(
    "list_set_item_status",
    {
      description:
        "Checks off, skips, or reopens a list item. Checking a plan item puts what was bought in the pantry (counts add in the same unit, levels go to full); reopening takes it back.",
      input: z.strictObject({
        listItemId: id("listItems", "The item, from list_get."),
        status: z.enum(["needed", "checked", "skipped"]).describe("checked means bought."),
      }),
      output: z.object({
        listItemId: z.string(),
        status: z.enum(["needed", "checked", "skipped"]),
      }),
      annotations: write({ idempotent: true }),
    },
    async (args) => {
      await backend.listSetItemStatus(args);
      return { data: args, summary: `Item ${args.status}.` };
    },
  );

  // Cooking, leftovers, closeout.

  tool(
    "cook_made",
    {
      description:
        "Records that a recipe was cooked: takes what it used out of the pantry (one ledger event per ingredient) and puts its yield in the fridge as leftovers. Joins the open week unless weekId says otherwise.",
      input: z.strictObject({
        recipeId: id("recipes", "The recipe cooked."),
        weekId: id("weeks", "The week it belongs to; the open week when left out.").optional(),
        multiplierText: z.string().default("1").describe('Batches made, like "1", "1/2", "2".'),
        skippedIngredientIds: z
          .array(id("ingredients", "An ingredient left out."))
          .default([])
          .describe("Ingredients not used; the pantry keeps them."),
        substitutions: z
          .array(
            z.object({
              ingredientId: id("ingredients", "The recipe's ingredient."),
              replacementIngredientId: id(
                "ingredients",
                "What was used instead; deducted in its place.",
              ).optional(),
              note: z.string().optional().describe("The swap in words."),
            }),
          )
          .default([])
          .describe("Swaps made while cooking."),
        notes: z.string().optional().describe("Anything worth remembering about this cook."),
      }),
      output: z.object({
        cookingEventId: z.string(),
        recipeName: z.string(),
        preparedFood: z
          .object({
            preparedFoodId: z.string(),
            name: z.string(),
            remaining: amount,
            unit: z.string(),
            location: z.enum(["fridge", "freezer"]),
          })
          .nullable(),
        noFoodReason: z.string().optional(),
        deductions: z.array(deduction),
      }),
      annotations: write({ destructive: true }),
    },
    async (args) => {
      const made = await backend.cookMade(args);
      const food = made.preparedFood;
      const short = made.deductions.filter((d) => d.wentNegative).length;
      const foodWords =
        food === null
          ? "nothing went in the fridge"
          : `${food.remaining.text} ${food.unit} in the ${food.location}`;
      return {
        data: made,
        summary: `Made ${made.recipeName}: ${plural(made.deductions.length, "ingredient")} taken from the pantry${short > 0 ? ` (${short} ran short)` : ""}, ${foodWords}.`,
      };
    },
  );

  tool(
    "leftovers_list",
    {
      description: "Cooked food still in the fridge or freezer, newest first, with what is left.",
      input: z.strictObject({}),
      output: z.object({ leftovers: z.array(leftover) }),
      annotations: read,
    },
    async () => {
      const leftovers = await backend.leftoversList({});
      return {
        data: { leftovers },
        summary:
          leftovers.length === 0
            ? "No leftovers."
            : `Leftovers: ${leftovers.map((f) => `${f.remaining.text} ${f.unit} ${f.name}`).join("; ")}.`,
      };
    },
  );

  tool(
    "leftovers_consume",
    {
      description:
        "Records eating some of a leftover. Eating the last of it marks it consumed. Recorded in the ledger.",
      input: z.strictObject({
        preparedFoodId: id("preparedFoods", "The leftover, from leftovers_list."),
        quantityText: quantityText(
          "How much was eaten, in the leftover's unit; 1 when left out",
        ).optional(),
      }),
      output: z.object({
        preparedFoodId: z.string(),
        remaining: amount,
        status: foodStatus,
      }),
      annotations: write({ destructive: true }),
    },
    async (args) => {
      const result = await backend.leftoversConsume(args);
      return {
        data: { preparedFoodId: args.preparedFoodId, ...result },
        summary: result.status === "consumed" ? "All eaten." : `${result.remaining.text} left.`,
      };
    },
  );

  tool(
    "leftovers_discard",
    {
      description: "Throws a leftover out. Recorded in the ledger.",
      input: z.strictObject({
        preparedFoodId: id("preparedFoods", "The leftover, from leftovers_list."),
      }),
      output: z.object({ preparedFoodId: z.string(), status: z.literal("discarded") }),
      annotations: write({ destructive: true }),
    },
    async ({ preparedFoodId }) => {
      await backend.leftoversDiscard({ preparedFoodId });
      return { data: { preparedFoodId, status: "discarded" as const }, summary: "Tossed." };
    },
  );

  tool(
    "week_closeout",
    {
      description:
        "Closes the week and opens the next one in planning. Every leftover still around is eaten unless a decision says tossed or keep (keep carries it into the next week). One ledger event per leftover.",
      input: z.strictObject({
        weekId: id("weeks", "The week to close, from weeks_current."),
        decisions: z
          .array(
            z.object({
              preparedFoodId: id("preparedFoods", "A leftover, from leftovers_list."),
              outcome: z.enum(["eaten", "tossed", "keep"]).describe("What happened to it."),
            }),
          )
          .default([])
          .describe("Leftovers not simply eaten."),
        weekOf: z
          .string()
          .optional()
          .describe("The next week's first day, YYYY-MM-DD; today (UTC) when left out."),
      }),
      output: z.object({ closedWeekId: z.string(), nextWeek: week }),
      annotations: write({ destructive: true }),
    },
    async (args) => {
      const next = await backend.weekCloseout(args);
      if (next === null) throw new Error("The next week did not open.");
      return {
        data: { closedWeekId: args.weekId, nextWeek: next },
        summary: `Week closed. Next: week of ${next.weekOf}, planning.`,
      };
    },
  );

  // The ledger.

  tool(
    "events_recent",
    {
      description:
        "The household's latest inventory events, newest first: purchases, deductions, adjustments, consumption, discards, closeouts, undos. Each says who acted (a member or an agent token).",
      input: z.strictObject({
        limit: z.number().int().min(1).max(200).optional().describe("How many; 50 when left out."),
      }),
      output: z.object({ events: z.array(inventoryEvent) }),
      annotations: read,
    },
    async (args) => {
      const events = await backend.eventsRecent(args);
      return { data: { events }, summary: `${plural(events.length, "event")}.` };
    },
  );
}
