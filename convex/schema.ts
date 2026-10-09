import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Every table but `households` and `members` is household-scoped, and `by_householdId`
// is its first index. Functions resolve the household from the signed-in member
// (convex/lib/auth.ts) and never take a household id from the client.
//
// Quantities keep the recipe's words (`quantityText`) beside a number for math
// (`quantityDecimal`). Pantry items carry `count` or `level`, never both; the
// mutations enforce that, the schema only allows it.

const quantity = v.object({
  quantityText: v.string(),
  quantityDecimal: v.optional(v.number()),
  unit: v.string(),
});

// A recipe-worded amount with its number for math: "1/2" and 0.5.
const amount = v.object({ text: v.string(), decimal: v.number() });

export const level = v.union(
  v.literal("full"),
  v.literal("half"),
  v.literal("low"),
  v.literal("out"),
);

export const inventoryEventType = v.union(
  v.literal("purchase"),
  v.literal("deduction"),
  v.literal("adjustment"),
  v.literal("consumption"),
  v.literal("discard"),
  v.literal("closeout"),
  v.literal("undo"),
);

export const inventoryActor = v.union(
  v.object({ kind: v.literal("member"), memberId: v.id("members") }),
  v.object({ kind: v.literal("token"), tokenId: v.id("householdTokens") }),
);

export const inventoryRefs = v.object({
  pantryItemId: v.optional(v.id("pantryItems")),
  listItemId: v.optional(v.id("listItems")),
  cookingEventId: v.optional(v.id("cookingEvents")),
  preparedFoodId: v.optional(v.id("preparedFoods")),
});

export default defineSchema({
  households: defineTable({
    name: v.string(),
    inviteCode: v.string(),
    createdAt: v.number(),
  }).index("by_inviteCode", ["inviteCode"]),

  members: defineTable({
    householdId: v.id("households"),
    clerkUserId: v.string(),
    name: v.optional(v.string()),
    joinedAt: v.number(),
  })
    .index("by_householdId", ["householdId"])
    .index("by_clerkUserId", ["clerkUserId"]),

  householdTokens: defineTable({
    householdId: v.id("households"),
    tokenHash: v.string(),
    label: v.string(),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_householdId", ["householdId"])
    .index("by_tokenHash", ["tokenHash"]),

  ingredients: defineTable({
    householdId: v.id("households"),
    name: v.string(),
    kind: v.union(v.literal("count"), v.literal("level")),
    category: v.string(),
    defaultUnit: v.optional(v.string()),
    aliases: v.array(v.string()),
    tracked: v.boolean(),
    notes: v.optional(v.string()),
    needsReview: v.boolean(),
  })
    .index("by_householdId", ["householdId"])
    .index("by_householdId_name", ["householdId", "name"]),

  pantryItems: defineTable({
    householdId: v.id("households"),
    ingredientId: v.id("ingredients"),
    location: v.union(
      v.literal("pantry"),
      v.literal("fridge"),
      v.literal("freezer"),
      v.literal("counter"),
    ),
    count: v.optional(
      v.object({ quantityText: v.string(), quantityDecimal: v.number(), unit: v.string() }),
    ),
    level: v.optional(level),
    purchaseNote: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_householdId", ["householdId"])
    .index("by_householdId_ingredientId", ["householdId", "ingredientId"]),

  recipes: defineTable({
    householdId: v.id("households"),
    name: v.string(),
    source: v.optional(
      v.object({
        type: v.string(),
        title: v.optional(v.string()),
        url: v.optional(v.string()),
        author: v.optional(v.string()),
        date: v.optional(v.string()),
      }),
    ),
    yield: v.optional(quantity),
    freezerFriendly: v.optional(v.boolean()),
    storageNotes: v.optional(v.string()),
    reheatingNotes: v.optional(v.string()),
    instructions: v.array(v.string()),
    tags: v.array(v.string()),
    sourceText: v.optional(v.string()),
    needsReview: v.boolean(),
    archivedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_householdId", ["householdId"]),

  recipeIngredients: defineTable({
    householdId: v.id("households"),
    recipeId: v.id("recipes"),
    order: v.number(),
    ingredientId: v.id("ingredients"),
    displayName: v.optional(v.string()),
    quantityText: v.string(),
    quantityDecimal: v.optional(v.number()),
    unit: v.string(),
    optional: v.boolean(),
    preparation: v.optional(v.string()),
    deductionIngredientId: v.optional(v.id("ingredients")),
    deductionNote: v.optional(v.string()),
    needsReview: v.boolean(),
  })
    .index("by_householdId", ["householdId"])
    .index("by_recipeId", ["recipeId"]),

  weeks: defineTable({
    householdId: v.id("households"),
    weekOf: v.string(),
    status: v.union(
      v.literal("planning"),
      v.literal("shopping"),
      v.literal("cooking"),
      v.literal("active"),
      v.literal("closed"),
    ),
    sourceUrls: v.array(v.string()),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_householdId", ["householdId"])
    .index("by_householdId_status", ["householdId", "status"]),

  weekRecipes: defineTable({
    householdId: v.id("households"),
    weekId: v.id("weeks"),
    recipeId: v.id("recipes"),
    status: v.union(v.literal("candidate"), v.literal("selected"), v.literal("skipped")),
    multiplier: amount,
  })
    .index("by_householdId", ["householdId"])
    .index("by_weekId", ["weekId"]),

  weekAdaptations: defineTable({
    householdId: v.id("households"),
    weekId: v.id("weeks"),
    recipeId: v.id("recipes"),
    kind: v.union(v.literal("replace"), v.literal("add"), v.literal("remove"), v.literal("adjust")),
    description: v.string(),
    originalIngredientId: v.optional(v.id("ingredients")),
    newIngredientId: v.optional(v.id("ingredients")),
    quantityText: v.optional(v.string()),
    quantityDecimal: v.optional(v.number()),
    unit: v.optional(v.string()),
  })
    .index("by_householdId", ["householdId"])
    .index("by_weekId", ["weekId"]),

  lists: defineTable({
    householdId: v.id("households"),
    weekId: v.id("weeks"),
    status: v.union(v.literal("draft"), v.literal("active"), v.literal("complete")),
    generatedAt: v.number(),
  })
    .index("by_householdId", ["householdId"])
    .index("by_weekId", ["weekId"]),

  listItems: defineTable({
    householdId: v.id("households"),
    listId: v.id("lists"),
    source: v.union(v.literal("plan"), v.literal("adhoc")),
    ingredientId: v.optional(v.id("ingredients")),
    displayName: v.string(),
    category: v.string(),
    storeTag: v.optional(v.string()),
    required: quantity,
    purchase: v.optional(
      v.object({
        quantityText: v.string(),
        quantityDecimal: v.optional(v.number()),
        unit: v.string(),
        note: v.optional(v.string()),
      }),
    ),
    status: v.union(
      v.literal("needed"),
      v.literal("checked"),
      v.literal("skipped"),
      v.literal("onHand"),
    ),
    checkedAt: v.optional(v.number()),
    sourceRecipeIds: v.array(v.id("recipes")),
  })
    .index("by_householdId", ["householdId"])
    .index("by_listId", ["listId"]),

  cookingEvents: defineTable({
    householdId: v.id("households"),
    weekId: v.optional(v.id("weeks")),
    recipeId: v.id("recipes"),
    cookedAt: v.number(),
    multiplier: amount,
    skippedIngredientIds: v.array(v.id("ingredients")),
    substitutions: v.array(
      v.object({
        ingredientId: v.id("ingredients"),
        replacementIngredientId: v.optional(v.id("ingredients")),
        note: v.optional(v.string()),
      }),
    ),
    notes: v.optional(v.string()),
    undoneAt: v.optional(v.number()),
  })
    .index("by_householdId", ["householdId"])
    .index("by_weekId", ["weekId"]),

  preparedFoods: defineTable({
    householdId: v.id("households"),
    recipeId: v.id("recipes"),
    weekId: v.optional(v.id("weeks")),
    cookingEventId: v.id("cookingEvents"),
    name: v.string(),
    starting: amount,
    remaining: amount,
    unit: v.string(),
    location: v.union(v.literal("fridge"), v.literal("freezer")),
    madeAt: v.number(),
    expiresAt: v.optional(v.number()),
    status: v.union(v.literal("available"), v.literal("consumed"), v.literal("discarded")),
  })
    .index("by_householdId", ["householdId"])
    .index("by_householdId_status", ["householdId", "status"]),

  inventoryEvents: defineTable({
    householdId: v.id("households"),
    type: inventoryEventType,
    at: v.number(),
    actor: inventoryActor,
    refs: inventoryRefs,
    // Before/after snapshot of whatever the event changed; shape is per event type.
    payload: v.any(),
    undoesEventId: v.optional(v.id("inventoryEvents")),
  })
    .index("by_householdId", ["householdId"])
    .index("by_householdId_at", ["householdId", "at"]),
});
