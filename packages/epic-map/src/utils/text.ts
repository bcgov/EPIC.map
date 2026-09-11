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
