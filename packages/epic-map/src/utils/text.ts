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

/**
 * A date as the panel writes it: "Oct 5, 2026", or "" for anything unreadable.
 *
 * Takes a date or a timestamp and reads only the day off it. The catalogue
 * sends a date, map-api sends the UTC instant an extract was loaded, and the
 * panel shows the same thing for both: which day the layer is from. The day is
 * taken as written rather than re-projected into the reader's zone - parsing it
 * at midday is what stops that - so an ingest at 09:00 UTC is dated the day it
 * ran, which is also the day it ran in BC.
 */
export const formatDate = (value?: string | null): string => {
  if (!value) return "";

  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
};
