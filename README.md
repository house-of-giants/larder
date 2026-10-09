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

## Check it

```sh
bun run check          # typecheck, lint, format, unit + convex tests, build
bun run test:e2e       # playwright against the built server (run `bun run build` first)
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
