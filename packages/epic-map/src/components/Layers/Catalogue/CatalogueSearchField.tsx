import { Box, IconButton, InputAdornment, TextField } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import { useTheme } from "@mui/material/styles";

type CatalogueSearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function CatalogueSearchField({
  value,
  onChange,
}: CatalogueSearchFieldProps) {
  const theme = useTheme();

  return (
    <Box sx={{ padding: "0 1rem 0.75rem" }}>
      <TextField
        size="small"
        fullWidth
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search"
        inputProps={{ "aria-label": "Search BC Data Catalogue" }}
        sx={{ marginBottom: 0 }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              {value && (
                <IconButton
                  size="small"
                  aria-label="Clear search"
                  onClick={() => onChange("")}
                >
                  <CloseIcon sx={{ fontSize: "1rem" }} />
                </IconButton>
              )}
              <SearchIcon
                aria-hidden
                sx={{ fontSize: "1.125rem", color: theme.palette.text.primary }}
              />
            </InputAdornment>
          ),
        }}
      />
    </Box>
  );
}
