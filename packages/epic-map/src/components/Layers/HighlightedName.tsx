import { Box } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";

/** Split `text` into alternating non-matching / matching runs of `query`. */
const splitOnMatches = (text: string, query: string): string[] => {
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

export default function HighlightedName({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const theme = useTheme();
  const parts = splitOnMatches(text, query.trim());

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Box
            key={index}
            component="mark"
            sx={{
              // A wash of the theme's gold: enough to find the match, not so
              // much that the name stops reading as one word.
              backgroundColor: alpha(theme.palette.secondary.main, 0.25),
              color: "inherit",
            }}
          >
            {part}
          </Box>
        ) : (
          part
        ),
      )}
    </>
  );
}
