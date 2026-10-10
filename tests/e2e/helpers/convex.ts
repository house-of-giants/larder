import { execFileSync } from "node:child_process";

// The dev deployment's internal functions and data, through the Convex CLI, the way
// tests/mcp/week.test.ts reaches them. Needs CONVEX_DEPLOYMENT (from .env.local).

/** An internal Convex function on the dev deployment; its JSON result (null prints nothing). */
export function convexRun<T>(name: string, args: Record<string, unknown>): T {
  const out = execFileSync("bunx", ["convex", "run", name, JSON.stringify(args)], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return (out.trim() === "" ? null : JSON.parse(out)) as T;
}

/** The household carrying this invite code (codes are unique), from the households table. */
export function householdIdByInviteCode(inviteCode: string): string {
  const out = execFileSync(
    "bunx",
    ["convex", "data", "households", "--format", "jsonLines", "--limit", "1000"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const rows = out
    .split("\n")
    .filter((line) => line.trim().startsWith("{"))
    .map((line) => JSON.parse(line) as { _id: string; inviteCode: string });
  const match = rows.find((row) => row.inviteCode === inviteCode);
  if (!match) throw new Error(`No household with invite code ${inviteCode}.`);
  return match._id;
}
