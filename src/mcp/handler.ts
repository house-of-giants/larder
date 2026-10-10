import { createMcpHandler } from "@modelcontextprotocol/server";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "../../convex/_generated/api";
import { hashAgentToken } from "#/lib/agent-tokens";
import { convexBackend, redactedMessage } from "./backend";
import { createLarderServer } from "./server";

// The MCP door, minus the routing: the bearer token is hashed and resolved to a household
// with the agent secret, and the request is served by a fresh, stateless MCP server bound
// to that household. src/routes/mcp.ts mounts it; tests/mcp drives it in-process.

export type DoorConfig = { convexUrl: string; agentSecret: string };

/** What the door needs from Convex; tests pass a fake. */
export type DoorClient = Pick<ConvexHttpClient, "query" | "mutation">;

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

/** RFC 6750: a bare challenge when no token came, `invalid_token` when one was refused. */
const unauthorized = (hadToken: boolean) =>
  json(
    401,
    { error: "invalid_token" },
    {
      "www-authenticate": hadToken ? 'Bearer error="invalid_token"' : "Bearer",
    },
  );

function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

export async function handleMcpRequest(
  request: Request,
  /** Null when the server lacks VITE_CONVEX_URL or AGENT_SECRET. */
  config: DoorConfig | null,
  makeClient: (convexUrl: string) => DoorClient = (url) => new ConvexHttpClient(url),
): Promise<Response> {
  const token = bearerToken(request);
  if (token === null) return unauthorized(false);
  if (config === null) {
    console.error("The MCP door needs VITE_CONVEX_URL and AGENT_SECRET on the server.");
    return json(503, { error: "not_configured" });
  }

  const client = makeClient(config.convexUrl);
  const { agentSecret } = config;
  const tokenHash = await hashAgentToken(token);
  // Nothing from a failed call leaves this function as is: Convex errors can echo the
  // secret and the hash back. A refusal of the secret itself reads as a refused token.
  let resolved;
  try {
    resolved = await client.query(api.agent.resolveToken, { agentSecret, tokenHash });
  } catch (error) {
    if (error instanceof ConvexError) return unauthorized(true);
    console.error(
      "Token resolution failed:",
      redactedMessage(error, [agentSecret, tokenHash, token]),
    );
    return json(503, { error: "unavailable" });
  }
  if (resolved === null) return unauthorized(true);

  // Runs beside the request and is awaited before returning, so a serverless function
  // does not freeze with it in flight. A failed stamp never fails the request, and its
  // error (which can echo the secret) is never logged.
  const touched = client
    .mutation(api.agent.touchToken, { agentSecret, tokenId: resolved.tokenId })
    .catch(() => console.warn("token stamp failed"));

  const backend = convexBackend(client, { agentSecret, ...resolved });
  // No notifications are sent, so the default mode answers every call with plain JSON.
  const handler = createMcpHandler(() => createLarderServer(backend));
  const response = await handler.fetch(request, {
    authInfo: { token, clientId: resolved.householdId, scopes: ["household"] },
  });
  await touched;
  return response;
}
