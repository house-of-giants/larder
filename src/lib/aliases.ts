// Matches a typed or imported ingredient name to the household's ingredient list.
//
// The resolver only merges on evidence: the same name, the same name in other case or
// spacing, a listed alias, or the singular/plural of one of those. It never merges on a
// similar spelling. When nothing matches it returns candidates for a person or an agent
// to choose from, so "mustard" never quietly becomes Dijon.

export type ResolveHow = "exact" | "case" | "alias" | "plural";

export type ResolveResult<Id> =
  | { kind: "match"; ingredientId: Id; how: ResolveHow }
  | { kind: "none"; candidates: Id[] };

export type Resolvable<Id> = { _id: Id; name: string; aliases: readonly string[] };

const preparations = [
  "shredded",
  "chopped",
  "grated",
  "minced",
  "diced",
  "sliced",
  "melted",
  "softened",
  "divided",
];
const trailingPreparation = new RegExp(`^(.*?)\\s*,\\s*(?:${preparations.join("|")})$`);

/** Lowercase, single-spaced, NFC; a trailing ", grated"-style preparation is dropped. */
export function normalizeName(s: string): string {
  const name = s.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");
  const prepared = trailingPreparation.exec(name);
  return prepared ? prepared[1] : name;
}

/**
 * Every plausible singular of the last word. "-ies" is ambiguous ("berries" -> "berry",
 * "pies" -> "pie"), so it yields both; the resolver accepts whichever one an ingredient
 * actually has. Words ending in "ss" or "us" are left alone.
 */
export function singularForms(s: string): string[] {
  const match = /^(.*?)([^\s]+)$/.exec(s);
  if (match === null) return [s];
  const [, head, word] = match;
  return singularWords(word).map((w) => head + w);
}

/** The first singular form: "large eggs" -> "large egg", "berries" -> "berry". */
export function singularize(s: string): string {
  return singularForms(s)[0];
}

function singularWords(word: string): string[] {
  if (word.length < 3 || word.endsWith("ss") || word.endsWith("us")) return [word];
  if (word.endsWith("ies")) return [`${word.slice(0, -3)}y`, word.slice(0, -1)];
  if (word.endsWith("oes")) return [word.slice(0, -2)];
  if (word.endsWith("s")) return [word.slice(0, -1)];
  return [word];
}

const maxCandidates = 5;

export function resolveIngredient<Id>(
  name: string,
  ingredients: readonly Resolvable<Id>[],
): ResolveResult<Id> {
  const query = normalizeName(name);
  if (query === "") return { kind: "none", candidates: [] };

  const raw = name.trim();
  const singulars = singularForms(query);
  const terms = (i: Resolvable<Id>) => [i.name, ...i.aliases].map(normalizeName);

  const steps: [ResolveHow, (i: Resolvable<Id>) => boolean][] = [
    ["exact", (i) => i.name === raw],
    ["case", (i) => normalizeName(i.name) === query],
    ["alias", (i) => i.aliases.some((alias) => normalizeName(alias) === query)],
    [
      "plural",
      (i) => terms(i).some((term) => singularForms(term).some((f) => singulars.includes(f))),
    ],
  ];

  for (const [how, matches] of steps) {
    const found = ingredients.filter(matches);
    if (found.length === 1) return { kind: "match", ingredientId: found[0]._id, how };
    // Two ingredients answer to the same name: let someone choose.
    if (found.length > 1) {
      return { kind: "none", candidates: found.slice(0, maxCandidates).map((i) => i._id) };
    }
  }

  const queryForms = [query, ...singulars];
  const candidates = ingredients.filter((i) =>
    terms(i).some((term) =>
      [term, ...singularForms(term)].some((form) =>
        queryForms.some((q) => containsWords(form, q) || containsWords(q, form)),
      ),
    ),
  );
  return { kind: "none", candidates: candidates.slice(0, maxCandidates).map((i) => i._id) };
}

/** Whole-word containment: "dijon mustard" holds "mustard"; "graham" does not hold "ham". */
function containsWords(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

/**
 * Picks to show while someone is still typing: the resolver's match or candidates first,
 * then ingredients with a name or alias word that starts with what has been typed ("mus"
 * offers both mustards). Suggestions only; nothing is merged until a person picks one.
 */
export function suggestIngredients<Id>(
  query: string,
  ingredients: readonly Resolvable<Id>[],
  limit = 6,
): Id[] {
  const typed = normalizeName(query);
  if (typed === "") return [];
  const result = resolveIngredient(query, ingredients);
  const ids = result.kind === "match" ? [result.ingredientId] : [...result.candidates];
  for (const i of ingredients) {
    if (ids.length >= limit) break;
    if (ids.includes(i._id)) continue;
    const startsAWord = [i.name, ...i.aliases].some((term) =>
      ` ${normalizeName(term)}`.includes(` ${typed}`),
    );
    if (startsAWord) ids.push(i._id);
  }
  return ids.slice(0, limit);
}
