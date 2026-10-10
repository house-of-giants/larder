// Where to go after sign-in. The path travels in `?redirect_url=`, which anyone can
// edit, so only a path on this site (or a URL on this site's own origin, reduced to its
// path) is honored; anything else is an open redirect.

// Control characters can smuggle a scheme or host past the checks below; URL parsing
// also strips tabs and newlines silently, so the raw text is checked first.
// oxlint-disable-next-line no-control-regex
const controlChars = /[\u0000-\u001f\u007f]/;

/**
 * `value` as a path on this site ("/join?code=abc"), otherwise undefined. With `origin`
 * (the page's own, e.g. `window.location.origin`), an absolute URL on that origin also
 * counts and is reduced to its path and search; the hash is dropped.
 */
export function localPath(value: unknown, origin?: string): string | undefined {
  if (typeof value !== "string" || controlChars.test(value)) return undefined;
  let path = value;
  if (origin !== undefined && !value.startsWith("/")) {
    const url = URL.canParse(value) ? new URL(value) : null;
    if (url === null || !/^https?:$/.test(url.protocol) || url.origin !== origin) {
      return undefined;
    }
    path = url.pathname + url.search;
  }
  if (!path.startsWith("/")) return undefined;
  // "//host" and "/\host" are protocol-relative in browsers: another site.
  if (path.startsWith("//") || path.startsWith("/\\")) return undefined;
  return path;
}

/**
 * What the sign-in and sign-up routes keep of `?redirect_url=`: a local path, or an http(s)
 * URL whose path is local. The route cannot see the origin; the screen settles it with
 * `localPath(value, window.location.origin)`.
 */
export function redirectParam(value: unknown): string | undefined {
  if (localPath(value) !== undefined) return value as string;
  if (typeof value !== "string" || !URL.canParse(value)) return undefined;
  return localPath(value, new URL(value).origin) === undefined ? undefined : value;
}

/** `/sign-in` or `/sign-up`, carrying the return path when there is one. */
export function authUrl(base: "/sign-in" | "/sign-up", returnTo: string | undefined): string {
  return returnTo ? `${base}?redirect_url=${encodeURIComponent(returnTo)}` : base;
}

/** Where the auth gate sends an anonymous visitor who asked for `requested`. */
export function signInRedirectHref(requested: string): string {
  const returnTo = localPath(requested);
  // "/" is where Clerk lands them anyway.
  return authUrl("/sign-in", returnTo === "/" ? undefined : returnTo);
}

/** The path and search of the page being loaded; the hash never reaches the server. */
export function returnTo(location: { pathname: string; searchStr: string }) {
  return { returnTo: location.pathname + location.searchStr };
}
