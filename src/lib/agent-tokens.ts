// Agent tokens: what the settings screen hands out and the MCP door checks. Shared by the
// Convex functions that mint and resolve them and by the server route that reads the
// bearer header, so both hash the same way. Web Crypto only: it runs in Convex and Node.

const prefix = "lard_";

/** `lard_` and 32 random bytes in base64url. Shown once; only its hash is stored. */
export function newAgentToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const base64 = btoa(String.fromCharCode(...bytes));
  return prefix + base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 of the whole token, lowercase hex: the `tokenHash` column. */
export async function hashAgentToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Compares every byte whatever the first mismatch, so timing does not reveal the secret. */
export function sameSecret(given: string, expected: string): boolean {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}
