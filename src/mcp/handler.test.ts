import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashAgentToken } from "#/lib/agent-tokens";
import { type DoorClient, handleMcpRequest } from "./handler";

// The door's own failure paths, with a fake Convex client. Validator errors from Convex
// echo the submitted arguments, which include the agent secret and the token's hash; none
// of that may reach the response, a thrown error, or the logs.

const secret = "dummy-secret-123";
const token = "lard_dummy-token";
const config = { convexUrl: "https://example.convex.cloud", agentSecret: secret };
const toolsList = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };

function request(bearer: string | null) {
  return new Request("http://larder.test/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(bearer !== null && { authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(toolsList),
  });
}

/** The error Convex returns for a bad argument: the whole argument object, echoed. */
const echoed = (hash: string) =>
  new Error(
    `[Request ID: 1f94ee60] Server Error\nArgumentValidationError: Value does not match validator.\nObject: {agentSecret: "${secret}", tokenHash: "${hash}"}`,
  );

function fakeClient(calls: {
  resolve: () => Promise<unknown>;
  touch?: () => Promise<unknown>;
}): DoorClient {
  return {
    query: async () => await calls.resolve(),
    mutation: async () => await (calls.touch ?? (async () => null))(),
  } as unknown as DoorClient;
}

let logged: string[];
beforeEach(() => {
  logged = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(
        args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(" "),
      );
    });
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Asserts nothing secret appears anywhere the outside world or the logs can see. */
async function expectNoLeak(response: Response, hash: string) {
  const body = await response.text();
  for (const leaked of [secret, hash, token]) {
    expect(body).not.toContain(leaked);
    expect(logged.join("\n")).not.toContain(leaked);
    for (const [, value] of response.headers) expect(value).not.toContain(leaked);
  }
}

describe("handleMcpRequest", () => {
  it("answers 503, never throws, and logs nothing secret when resolution fails", async () => {
    const hash = await hashAgentToken(token);
    const client = fakeClient({ resolve: async () => Promise.reject(echoed(hash)) });
    const response = await handleMcpRequest(request(token), config, () => client);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toBe("application/json");
    await expectNoLeak(response.clone(), hash);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(logged).toEqual([expect.stringContaining("Token resolution failed")]);
  });

  it("answers 401 when Convex refuses the agent secret", async () => {
    const hash = await hashAgentToken(token);
    const client = fakeClient({
      resolve: async () => Promise.reject(new ConvexError("Agent access refused.")),
    });
    const response = await handleMcpRequest(request(token), config, () => client);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer error="invalid_token"');
    await expectNoLeak(response, hash);
  });

  it("serves the request and logs one fixed line when stamping the token fails", async () => {
    const hash = await hashAgentToken(token);
    const client = fakeClient({
      resolve: async () => ({ householdId: "hh_1", tokenId: "tok_1" }),
      touch: async () => Promise.reject(echoed(hash)),
    });
    const response = await handleMcpRequest(request(token), config, () => client);
    expect(response.status).toBe(200);
    await expectNoLeak(response, hash);
    expect(logged).toEqual(["token stamp failed"]);
  });

  it("answers a missing bearer with 401 before it needs any configuration", async () => {
    const response = await handleMcpRequest(request(null), null, () => {
      throw new Error("no client should be made");
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
  });

  it("answers 503 not_configured when a token comes but the door has no secret", async () => {
    const response = await handleMcpRequest(request(token), null, () => {
      throw new Error("no client should be made");
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "not_configured" });
  });
});
