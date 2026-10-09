// Shared by the convex-test suites. Type-only imports keep convex-test out of the
// deployed bundle (Convex pushes every module in this directory).
import type { TestConvex } from "convex-test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type schema from "./schema";

export type Test = TestConvex<typeof schema>;

/** A synthetic Clerk identity; `subject` is what members.clerkUserId stores. */
export function identityFor(name: string) {
  const subject = `user_${name.toLowerCase()}`;
  return {
    subject,
    tokenIdentifier: `https://clerk.test|${subject}`,
    name,
  };
}

/** Signs `who` in, creates a household named `name`, returns the caller and the id. */
export async function createHousehold(
  t: Test,
  { who, name }: { who: string; name: string },
): Promise<{ as: ReturnType<Test["withIdentity"]>; householdId: Id<"households"> }> {
  const as = t.withIdentity(identityFor(who));
  const householdId = await as.mutation(api.households.create, { name });
  return { as, householdId };
}
