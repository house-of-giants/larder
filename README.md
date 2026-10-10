# Larder

A household meal-prep app. Pick the week's recipes, get a list that already knows the
pantry, check it off in the store with no signal, say "made it" and have the pantry and
leftovers follow, close the week in one tap.

Agents plan and import recipes through an MCP door. Humans read and tap in a PWA. The app
itself makes no LLM calls.

`PRODUCT.md` is the product register: who it is for, the voice, what it will not do.

## Stack

TanStack Start (Vite 8, Nitro 3), Convex, Clerk, Tailwind v4, shadcn/ui. Bun for
packages and scripts. Deployed on Vercel.

## Run it

```sh
bun install
cp .env.example .env.local      # fill in Clerk keys; `bunx convex dev` fills in Convex
bunx convex dev                  # one terminal: pushes convex/ and watches
bun run dev                      # another: http://localhost:3000
```

Clerk needs a JWT template named `convex` and the deployment needs its issuer domain:

```sh
bunx convex env set CLERK_JWT_ISSUER_DOMAIN https://<instance>.clerk.accounts.dev
```

## Seed a dev household

`convex/seed/` holds a real week of fixtures: 92 ingredients, 7 recipes, the pantry on hand,
and a planned week. Load them into a household you belong to (find its id in the Convex
dashboard's `households` table). Seeding runs only on a deployment that allows it, so set
that once on the dev deployment, never on production:

```sh
bunx convex env set SEED_ALLOWED true
bunx convex run seed:load '{"householdId":"<id>"}'
```

It replaces that household's ingredients, pantry, recipes, weeks, lists, and ledger;
members and agent tokens stay. Running it again gives the same result. It is an internal
function, so the app cannot call it.

## Agents (the MCP door)

Agents reach the household through `/mcp`, a Streamable HTTP MCP server with 25 tools
(`src/mcp/tools.ts`). Each request carries a household agent token as its bearer; the
server route resolves it and calls the Convex agent functions (`convex/agent.ts`) with a
shared secret, so the household always comes from the token, never from the agent.

Set the secret once per deployment, the same value in both places:

```sh
openssl rand -base64 32          # the value
bunx convex env set AGENT_SECRET <value>
echo 'AGENT_SECRET=<value>' >> .env.local
```

Then make a token on Settings, under Agent access. It is shown once; the database keeps
only its SHA-256. Revoking it there shuts the door to that token on the next request. An
MCP client connects with:

```json
{
  "mcpServers": {
    "larder": {
      "type": "http",
      "url": "https://<your-domain>/mcp",
      "headers": { "Authorization": "Bearer lard_<token>" }
    }
  }
}
```

`bun run test:mcp` drives a whole week through the door against the dev deployment (run
`bunx convex dev --once` first so the functions are current). It makes a throwaway
household with the internal `testing:*` helpers, seeds it, mints and revokes a token, and
deletes the household afterwards.

## Check it

```sh
bun run check          # typecheck, lint, format, unit + convex tests, build
bun run test:e2e       # playwright against the built server (run `bun run build` first)
```

`.env.local` is not exported to Playwright or the built server on its own. With Clerk keys
in it, load it for both so the signed-in suites run:

```sh
set -a; . ./.env.local; set +a; bun run build && bun run test:e2e
```

The browser week (`tests/e2e/clerk-week.spec.ts`) walks a whole week with real sessions:
sign-up, invites, the seeded week, the list, store mode offline, a cook, closeout and its
undo, sign-out. It is opt-in and never runs in CI:

```sh
set -a; . ./.env.local; set +a; bun run build && E2E_CLERK_WEEK=1 bun run test:e2e
```

It signs up new Clerk test users on the dev instance every run (`+clerk_test@example.com`
addresses, verification code `424242`; they stay in the instance), seeds its household
with `bunx convex run seed:load` (needs `SEED_ALLOWED` on the dev deployment), and deletes
the households it makes at the end. Screenshots land in `test-results/clerk-week/`.

## Deploy

Vercel builds every PR as a preview against the dev Convex deployment. Production builds
(`vercel.json`) run `convex deploy --cmd 'bun run build'`: it runs the app build first,
with the production `VITE_CONVEX_URL` injected, and pushes `convex/` to the production
deployment only once that build succeeds.

### First production deploy

In this order; each step needs the one before it.

1. **Clerk.** Create the production instance for the app's domain and finish its DNS
   records. Add a JWT template named `convex` (Clerk's Convex preset). Note the
   instance's Frontend API URL (`https://clerk.<your-domain>`), the publishable key, and
   the secret key.
2. **Convex.** Create the production deployment in the Convex dashboard, make a
   production deploy key there, and set the production deployment's environment:

   ```sh
   bunx convex env set --prod CLERK_JWT_ISSUER_DOMAIN https://clerk.<your-domain>
   bunx convex env set --prod AGENT_SECRET <long random string>
   ```

   Never set `SEED_ALLOWED` on production.

3. **Vercel, Production environment.** Add each with `vercel env add <NAME> production`:

   | Name                         | Value                                                          |
   | ---------------------------- | -------------------------------------------------------------- |
   | `CONVEX_DEPLOY_KEY`          | the production deploy key (Vercel only; never in `.env.local`) |
   | `VITE_CLERK_PUBLISHABLE_KEY` | Clerk production publishable key (`pk_live_...`)               |
   | `CLERK_SECRET_KEY`           | Clerk production secret key (`sk_live_...`)                    |
   | `CLERK_SIGN_IN_URL`          | `/sign-in`                                                     |
   | `CLERK_SIGN_UP_URL`          | `/sign-up`                                                     |
   | `AGENT_SECRET`               | the same value as on the Convex production deployment          |

   Do not set `VITE_CONVEX_URL` for Production; `convex deploy` provides it.

4. **Ship.** Merge to `main`, or run `vercel --prod` from a clean checkout of `main`.
5. **Check.** Open the production URL: it should send you to sign-in, then to Start a
   household. `/manifest.webmanifest` and `/sw.js` should load.

### A branch build on a phone

Preview URLs sit behind Vercel Authentication. On the phone, sign in to Vercel in the
same browser first, then open the preview URL and add it to the home screen (Settings in
the app shows the taps). A home-screen app keeps its own cookies on iOS, so if it lands
on Vercel's login, sign in there once. For a device or tool that cannot sign in to
Vercel, use Protection Bypass for Automation (Project Settings, Deployment Protection)
and open the URL with `?x-vercel-protection-bypass=<secret>&x-vercel-set-bypass-cookie=true`
once; the cookie carries later visits. Do not share that secret beyond the household.

Analytics (PostHog) is not wired in v1.

## Layout

```
convex/        schema and functions; every function is household-scoped
src/routes/    file routes (TanStack Router)
src/lib/       pure logic: quantities, levels, list generation, aliases
src/mcp/       MCP tool definitions and the per-request server factory
src/offline/   store-mode snapshot and check-off queue (IndexedDB)
tests/e2e/     Playwright
```

## License

MIT. See `LICENSE`.
