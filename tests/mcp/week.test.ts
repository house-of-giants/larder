import { execFileSync } from "node:child_process";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DoorConfig, handleMcpRequest } from "#/mcp/handler";

// The whole week through the real MCP door, against the dev deployment: the route's own
// handler runs in-process and calls Convex over HTTP with the agent secret, exactly as the
// deployed server would. Run with `bun run test:mcp` after `bunx convex dev --once`.
//
// It makes its own household (internal dev helpers, through `bunx convex run`), seeds it
// with the fixture week, mints a token, drives every step, revokes the token, and deletes
// the household afterwards, so it can run again and leaves nothing behind.

const convexUrl = process.env.VITE_CONVEX_URL;
const agentSecret = process.env.AGENT_SECRET;
if (!convexUrl || !agentSecret) {
  throw new Error(
    "test:mcp needs VITE_CONVEX_URL and AGENT_SECRET in .env.local, and AGENT_SECRET set on the dev deployment.",
  );
}
const config: DoorConfig = { convexUrl, agentSecret };
const mcpUrl = "http://larder.test/mcp";

/** An internal Convex function on the dev deployment; its JSON result (null prints nothing). */
function convexRun<T>(name: string, args: Record<string, unknown>): T {
  const out = execFileSync("bunx", ["convex", "run", name, JSON.stringify(args)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return (out.trim() === "" ? null : JSON.parse(out)) as T;
}

/** A request to the door the way an MCP client sends one. */
function post(token: string | null, body: unknown) {
  return handleMcpRequest(
    new Request(mcpUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(token !== null && { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    }),
    config,
  );
}
const toolsList = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

let householdId: string;
let tokenId: string;
let token: string;
let client: Client;

beforeAll(async () => {
  const stamp = new Date().toISOString();
  householdId = convexRun<string>("testing:createDevHousehold", {
    name: `MCP test ${stamp}`,
    clerkUserId: `mcp_test_${Date.now()}`,
  });
  convexRun("seed:load", { householdId });
  ({ tokenId, token } = convexRun<{ tokenId: string; token: string }>("testing:mintToken", {
    householdId,
    label: "MCP test",
  }));

  client = new Client(
    { name: "larder-week-test", version: "1.0.0" },
    {
      versionNegotiation: { mode: "auto" },
    },
  );
  await client.connect(
    new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
      fetch: (url, init) => handleMcpRequest(new Request(url, init), config),
    }),
  );
});

afterAll(async () => {
  await client?.close();
  if (householdId) convexRun("testing:deleteDevHousehold", { householdId });
});

/** Calls a tool and returns its structuredContent; any tool error fails the test. */
// The structured content is checked by the server against each tool's outputSchema; the
// test reads it loosely.
async function call(name: string, args: Record<string, unknown> = {}): Promise<any> {
  const result = await client.callTool({ name, arguments: args });
  expect({ tool: name, ...result }).not.toHaveProperty("isError", true);
  return result.structuredContent;
}

describe("the MCP door", () => {
  it("refuses a request with no token, or a token it does not know", async () => {
    for (const bearer of [null, "lard_not-a-real-token"]) {
      const response = await post(bearer, toolsList);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "invalid_token" });
      expect(response.headers.get("www-authenticate")).toBe(
        bearer === null ? "Bearer" : 'Bearer error="invalid_token"',
      );
    }
  });

  it("runs a whole week, then refuses the token once it is revoked", async () => {
    // The seeded week is open and planning, with the fixture's seven recipes selected.
    const { week } = await call("weeks_current");
    expect(week).toMatchObject({ weekOf: "2026-10-09", status: "planning" });
    expect(week.recipes).toHaveLength(7);

    // A recipe by names: "large eggs" resolves; "mustard" has two close matches, so it is
    // not guessed; "crumpets" is new.
    const saved = await call("recipes_upsert", {
      name: "Crumpets with eggs",
      yield: { quantityText: "2", unit: "plates" },
      ingredients: [
        { name: "large eggs", quantityText: "2", unit: "each" },
        { name: "mustard", quantityText: "1", unit: "tsp" },
        { name: "crumpets", quantityText: "4", unit: "each" },
      ],
    });
    const created = Object.fromEntries(
      saved.createdIngredients.map((c: { name: string }) => [c.name, c]),
    );
    expect(Object.keys(created).sort()).toEqual(["crumpets", "mustard"]);
    expect(created.mustard.candidates.map((c: { name: string }) => c.name).sort()).toEqual([
      "Dijon mustard",
      "whole-grain mustard",
    ]);
    expect(created.crumpets.candidates).toEqual([]);

    // Only the new recipe this week.
    const { week: planned } = await call("weeks_set_recipes", {
      weekId: week._id,
      recipes: [
        ...week.recipes.map((r: { recipeId: string }) => ({
          recipeId: r.recipeId,
          status: "skipped",
        })),
        { recipeId: saved.recipeId, status: "selected" },
      ],
    });
    expect(
      planned.recipes.filter((r: { status: string }) => r.status === "selected"),
    ).toMatchObject([{ recipeId: saved.recipeId, name: "Crumpets with eggs" }]);

    // The list: eggs are on hand (15 in the fridge), mustard and crumpets are needed.
    const generated = await call("list_generate", { weekId: week._id });
    expect(generated.list.sections.length).toBeGreaterThan(0);
    const { list } = await call("list_get");
    expect(list.weekId).toBe(week._id);
    const items = list.sections.flatMap((s: { items: unknown[] }) => s.items);
    const byName = Object.fromEntries(
      items.map((i: { displayName: string }) => [i.displayName, i]),
    );
    expect(byName["large eggs"]).toMatchObject({ status: "onHand" });
    expect(byName.mustard).toMatchObject({
      status: "needed",
      required: { quantityText: "1", unit: "tsp" },
    });
    expect(items.filter((i: { status: string }) => i.status === "needed").length).toBeGreaterThan(
      0,
    );
    expect((await call("weeks_current")).week.status).toBe("shopping");

    // Bought: the mustard goes into the pantry.
    await call("list_set_item_status", { listItemId: byName.mustard._id, status: "checked" });
    const { items: pantry } = await call("pantry_list");
    expect(pantry.find((p: { name: string }) => p.name === "mustard")).toMatchObject({
      count: { quantityDecimal: 1, unit: "tsp" },
    });

    // Made it: eggs and mustard come out of the pantry, two plates go in the fridge.
    const made = await call("cook_made", { recipeId: saved.recipeId });
    expect(made.recipeName).toBe("Crumpets with eggs");
    expect(made.preparedFood).toMatchObject({
      remaining: { text: "2", decimal: 2 },
      unit: "plates",
      location: "fridge",
    });
    const used = Object.fromEntries(
      made.deductions.map((d: { name: string; after: number }) => [d.name, d.after]),
    );
    expect(used).toMatchObject({ "large eggs": 13, mustard: 0 });

    const { leftovers } = await call("leftovers_list");
    expect(leftovers).toMatchObject([
      { _id: made.preparedFood.preparedFoodId, name: "Crumpets with eggs" },
    ]);

    const eaten = await call("leftovers_consume", {
      preparedFoodId: made.preparedFood.preparedFoodId,
      quantityText: "1",
    });
    expect(eaten).toMatchObject({ remaining: { decimal: 1 }, status: "available" });

    // Closeout: the last plate is eaten by default and the next week opens.
    const closed = await call("week_closeout", { weekId: week._id, weekOf: "2026-10-16" });
    expect(closed.closedWeekId).toBe(week._id);
    expect(closed.nextWeek).toMatchObject({ weekOf: "2026-10-16", status: "planning" });
    expect((await call("leftovers_list")).leftovers).toEqual([]);

    // The ledger, newest first: every write above, each by this token.
    const { events } = await call("events_recent", { limit: 30 });
    const ours = events.filter(
      (e: { actor: { kind: string; tokenId?: string } }) =>
        e.actor.kind === "token" && e.actor.tokenId === tokenId,
    );
    const sequence = ours
      .map((e: { type: string }) => e.type)
      .filter((type: string, i: number, all: string[]) => type !== all[i - 1]);
    expect(sequence).toEqual(["closeout", "consumption", "adjustment", "deduction", "purchase"]);
    expect(ours.filter((e: { type: string }) => e.type === "deduction")).toHaveLength(2);

    // Revoked: the next request is a 401, and so is the next tool call.
    expect((await post(token, toolsList)).status).toBe(200);
    convexRun("testing:revokeToken", { tokenId });
    const refused = await post(token, toolsList);
    expect(refused.status).toBe(401);
    expect(await refused.json()).toEqual({ error: "invalid_token" });
    await expect(client.callTool({ name: "pantry_list", arguments: {} })).rejects.toThrow(
      /invalid_token/,
    );
  });
});
