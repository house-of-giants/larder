import { localPath } from "#/lib/redirect";

// Clerk's <SignIn /> and <SignUp /> read these from the address bar themselves, ahead of
// the redirect props the app passes, and check them only against Clerk's own allowed
// origins. The app's rule (src/lib/redirect.ts) has to be the only one that counts, so a
// value it would not honor leaves the address bar before a card mounts.
const REDIRECT_URL = "redirect_url";
// The app never sets these, so any value in the address bar came from someone else.
const ALWAYS_STRIPPED = [
  "sign_in_force_redirect_url",
  "sign_up_force_redirect_url",
  "sign_in_fallback_redirect_url",
  "sign_up_fallback_redirect_url",
];

/** Drops the redirect parameters the app would not honor; true when any went. */
function clean(params: URLSearchParams, origin: string): boolean {
  let changed = false;
  for (const name of ALWAYS_STRIPPED) {
    if (params.has(name)) {
      params.delete(name);
      changed = true;
    }
  }
  const values = params.getAll(REDIRECT_URL);
  if (values.length > 0 && !(values.length === 1 && localPath(values[0], origin))) {
    params.delete(REDIRECT_URL);
    changed = true;
  }
  return changed;
}

function withQuery(base: string, params: URLSearchParams): string {
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * The sign-in or sign-up address (`href`, on `origin`) with every redirect parameter the app
 * would not honor removed, as path, search, and hash; null when it is already clean. Clerk
 * also carries a query inside the hash (`#/?redirect_url=...`), which is cleaned the same way.
 */
export function cleanAuthHref(href: string, origin: string): string | null {
  const url = new URL(href);
  const searchChanged = clean(url.searchParams, origin);

  let hash = url.hash;
  let hashChanged = false;
  const queryAt = hash.indexOf("?");
  if (queryAt !== -1) {
    const hashParams = new URLSearchParams(hash.slice(queryAt + 1));
    hashChanged = clean(hashParams, origin);
    if (hashChanged) hash = withQuery(hash.slice(0, queryAt), hashParams);
  }

  if (!searchChanged && !hashChanged) return null;
  return withQuery(url.pathname, url.searchParams) + hash;
}
