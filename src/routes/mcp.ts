import { createFileRoute } from "@tanstack/react-router";
import { handleMcpRequest } from "#/mcp/handler";

// The MCP door for agents: Streamable HTTP, POST only, a household agent token as the
// bearer. Tokens are made on the settings screen. Stateless, so every other method (GET's
// event stream, DELETE's session end, PUT, PATCH, OPTIONS, HEAD) is refused with 405.

const notAllowed = () =>
  new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { allow: "POST", "content-type": "application/json" },
  });

export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const convexUrl = process.env.VITE_CONVEX_URL ?? import.meta.env.VITE_CONVEX_URL;
        const agentSecret = process.env.AGENT_SECRET;
        return await handleMcpRequest(
          request,
          convexUrl && agentSecret ? { convexUrl, agentSecret } : null,
        );
      },
      // Start falls back to ANY for any method without its own handler (HEAD tries GET first).
      ANY: notAllowed,
    },
  },
});
