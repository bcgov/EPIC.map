/**
 * Catalogue descriptions are authored as Markdown but shown here as plain text,
 * so the markup has to come off before it reaches the panel.
 *
 * Deliberately a light touch rather than a parser: the goal is a readable
 * sentence or two in a narrow panel, and the full record is one link away.
 */
export const stripMarkdown = (markdown: string): string =>
  markdown
    // [label](href) and ![alt](src) keep the human-readable half.
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Leading heading hashes and blockquote markers.
    .replace(/^[>#]+\s*/gm, "")
    // Emphasis and inline code fences around a word.
    .replace(/[*_`]/g, "")
    // CKAN stores CRLF; collapse every run of whitespace into one space.
    .replace(/\s+/g, " ")
    .trim();

/** Cut at the last word boundary before `limit`, so no word is left mid-way. */
export const truncate = (text: string, limit: number): string => {
  if (text.length <= limit) return text;

  const clipped = text.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
};

/**
 * Split `text` into alternating non-matching / matching runs of `query`.
 *
 * Even indices did not match and odd ones did, which is what lets a caller
 * render the two differently without knowing anything about the search. The
 * layers panel washes the odd runs in gold; the map's search bar sets them bold.
 *
 * Always returns an odd number of parts, so the alternation holds even when the
 * text begins or ends on a match — those boundary runs come back empty rather
 * than absent. An empty query is one part: the whole string, unmatched.
 */
export const splitOnMatches = (text: string, query: string): string[] => {
  if (!query) return [text];

  const parts: string[] = [];
  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();

  let cursor = 0;
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, cursor)
  ) {
    parts.push(text.slice(cursor, at), text.slice(at, at + needle.length));
    cursor = at + needle.length;
  }
  parts.push(text.slice(cursor));

  return parts;
};
