/** The link a member shares: `/join?code=...` on this app's origin. */
export function inviteUrl(origin: string, code: string): string {
  const url = new URL("/join", origin);
  url.searchParams.set("code", code);
  return url.toString();
}

/** People paste the whole link into the code box as often as the code itself. */
export function codeFromInput(raw: string): string {
  const input = raw.trim();
  if (URL.canParse(input)) {
    const code = new URL(input).searchParams.get("code");
    if (code) return code.trim();
  }
  return input;
}
