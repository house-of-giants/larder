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

## Check it

```sh
bun run check          # typecheck, lint, format, unit + convex tests, build
bun run test:e2e       # playwright against the built server (run `bun run build` first)
```

## Deploy

Vercel builds every PR as a preview with the dev deployment's `VITE_CONVEX_URL`. The
production build (`vercel.json`) runs `convex deploy`, which needs these on Vercel's
production environment:

- `CONVEX_DEPLOY_KEY`: a production deploy key from the Convex dashboard. It sets
  `VITE_CONVEX_URL` for the build on its own.
- `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`: from the Clerk production instance.
- `CLERK_SIGN_IN_URL=/sign-in`, `CLERK_SIGN_UP_URL=/sign-up`.

And on the production Convex deployment:

```sh
bunx convex env set --prod CLERK_JWT_ISSUER_DOMAIN https://clerk.<your-domain>
```

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
