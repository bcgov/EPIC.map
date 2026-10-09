import { Box } from "@mui/material";
import { alpha, useTheme } from "@mui/material/styles";
import { splitOnMatches } from "@/utils/text";

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
