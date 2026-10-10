import type { ConvexHttpClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// What the MCP tools call: one method per Convex agent function, taking that function's own
// arguments. The server route builds one over HTTP for the token's household; tests build
// an in-memory one. A later in-page (WebMCP) door can implement the same shape.

type AgentFunctions = Omit<typeof api.agent, "resolveToken" | "touchToken">;

/** Who the route resolved the bearer token to, plus the secret that proves it is the route. */
export type AgentIdentity = {
  agentSecret: string;
  householdId: Id<"households">;
  tokenId: Id<"householdTokens">;
};

type OwnArgs<F extends FunctionReference<"query" | "mutation">> = Omit<
  FunctionArgs<F>,
  keyof AgentIdentity
>;

export type LarderBackend = {
  [K in keyof AgentFunctions]: (
    args: OwnArgs<AgentFunctions[K]>,
  ) => Promise<FunctionReturnType<AgentFunctions[K]>>;
};

/**
 * A ConvexError's own sentence ("Close the current week first.") as a plain Error. Any other
 * error (an argument that failed a validator) loses Convex's request-id prefix and never
 * carries the agent secret, which validator messages can echo back.
 */
async function plainErrors<T>(secret: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") {
      throw new Error(error.data);
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      message
        .replace(/^\[Request ID: [^\]]*\] Server Error\n/, "")
        .split(secret)
        .join("[redacted]")
        .trim(),
    );
  }
}

export function convexBackend(client: ConvexHttpClient, identity: AgentIdentity): LarderBackend {
  const query =
    <F extends FunctionReference<"query">>(fn: F) =>
    (args: OwnArgs<F>) =>
      plainErrors(identity.agentSecret, () =>
        client.query(fn, { ...args, ...identity } as FunctionArgs<F>),
      );
  const mutation =
    <F extends FunctionReference<"mutation">>(fn: F) =>
    (args: OwnArgs<F>) =>
      plainErrors(identity.agentSecret, () =>
        client.mutation(fn, { ...args, ...identity } as FunctionArgs<F>),
      );

  const agent = api.agent;
  return {
    pantryList: query(agent.pantryList),
    pantrySetCount: mutation(agent.pantrySetCount),
    pantrySetLevel: mutation(agent.pantrySetLevel),
    pantryMarkOut: mutation(agent.pantryMarkOut),
    ingredientsList: query(agent.ingredientsList),
    ingredientsResolve: query(agent.ingredientsResolve),
    ingredientsUpsert: mutation(agent.ingredientsUpsert),
    recipesList: query(agent.recipesList),
    recipesGet: query(agent.recipesGet),
    recipesUpsert: mutation(agent.recipesUpsert),
    recipesArchive: mutation(agent.recipesArchive),
    weeksCurrent: query(agent.weeksCurrent),
    weeksCreate: mutation(agent.weeksCreate),
    weeksSetRecipes: mutation(agent.weeksSetRecipes),
    weeksAddAdaptation: mutation(agent.weeksAddAdaptation),
    weeksSetStatus: mutation(agent.weeksSetStatus),
    listGet: query(agent.listGet),
    listGenerate: mutation(agent.listGenerate),
    listAddItem: mutation(agent.listAddItem),
    listSetItemStatus: mutation(agent.listSetItemStatus),
    cookMade: mutation(agent.cookMade),
    leftoversList: query(agent.leftoversList),
    leftoversConsume: mutation(agent.leftoversConsume),
    leftoversDiscard: mutation(agent.leftoversDiscard),
    weekCloseout: mutation(agent.weekCloseout),
    eventsRecent: query(agent.eventsRecent),
  };
}
