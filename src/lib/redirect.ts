// Where to go after sign-in. The path travels in `?redirect_url=`, which anyone can
// edit, so only a path on this site is honored; anything else is an open redirect.

/** `value` when it is a path on this site ("/join?code=abc"), otherwise undefined. */
export function localPath(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("/")) return undefined;
  // "//host" and "/\host" are protocol-relative in browsers: another site.
  if (value.startsWith("//") || value.startsWith("/\\")) return undefined;
  // Control characters can smuggle a scheme or host past the checks above.
  // oxlint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined;
  return value;
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
