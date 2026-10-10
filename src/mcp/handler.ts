import { createMcpHandler } from "@modelcontextprotocol/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { hashAgentToken } from "#/lib/agent-tokens";
import { convexBackend } from "./backend";
import { createLarderServer } from "./server";

// The MCP door, minus the routing: the bearer token is hashed and resolved to a household
// with the agent secret, and the request is served by a fresh, stateless MCP server bound
// to that household. src/routes/mcp.ts mounts it; tests/mcp drives it in-process.

export type DoorConfig = { convexUrl: string; agentSecret: string };

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

export async function handleMcpRequest(request: Request, config: DoorConfig): Promise<Response> {
  const token = bearerToken(request);
  if (token === null) return unauthorized(false);

  const client = new ConvexHttpClient(config.convexUrl);
  const { agentSecret } = config;
  const resolved = await client.query(api.agent.resolveToken, {
    agentSecret,
    tokenHash: await hashAgentToken(token),
  });
  if (resolved === null) return unauthorized(true);

  // Runs beside the request and is awaited before returning, so a serverless function
  // does not freeze with it in flight. A failed stamp never fails the request.
  const touched = client
    .mutation(api.agent.touchToken, { agentSecret, tokenId: resolved.tokenId })
    .catch((error: unknown) => console.warn("Could not stamp the token's last use", error));

  const backend = convexBackend(client, { agentSecret, ...resolved });
  // No progress or logging notifications are sent, so plain JSON responses suffice.
  const handler = createMcpHandler(() => createLarderServer(backend), { responseMode: "json" });
  const response = await handler.fetch(request, {
    authInfo: { token, clientId: resolved.householdId, scopes: ["household"] },
  });
  await touched;
  return response;
}
