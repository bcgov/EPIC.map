import { Box } from "@mui/material";
import { splitOnMatches } from "@/utils/text";

/**
 * A result's name with the matched run in bold.
 *
 * Weight rather than the gold wash `HighlightedName` puts behind a catalogue
 * match, and the distinction is the setting rather than a preference: the layers
 * panel highlights one match inside a long dataset title, where the eye needs
 * leading to it, while these rows are short names in a list the user is reading
 * top to bottom. A row of coloured blocks down the dropdown would compete with
 * the pills beside them.
 */
export default function MatchedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const parts = splitOnMatches(text, query.trim());

  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Box key={index} component="strong" sx={{ fontWeight: 700 }}>
            {part}
          </Box>
        ) : (
          part
        ),
      )}
    </>
  );
}
