# Contributing

Larder is a House of Giants lab product. Issues and pull requests are welcome.

- Branch from `main`; open a PR with a clear description of the behavior change.
- `bun run check` must pass. CI runs the same commands plus a Playwright smoke.
- Pure logic goes in `src/lib` with tests written first.
- Every Convex function takes its household from the authenticated member or the
  bearer token, never from the client. A missing household filter is a blocking finding.
- Ad-hoc list items never write to the pantry. Level items never get decimals. No unit
  conversion. The recipe's words win on screen.
- No LLM calls inside the app. Anything that needs a model belongs to an agent through
  the MCP door.
- No secrets in the repo. `.env.local` is ignored; `.env.example` documents the names.
