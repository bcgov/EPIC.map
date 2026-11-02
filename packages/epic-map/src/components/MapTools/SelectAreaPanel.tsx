import { Box, Button, ButtonBase, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { useTheme } from "@mui/material/styles";
import {
  ACTIVE_FILL,
  BORDER_DARK,
  FOCUS_RING,
  HOVER_FILL,
  INFO_BORDER,
  INFO_FILL,
  INFO_ICON,
  LINK,
  MENU_SEPARATOR,
} from "@/components/Filters/filterTokens";
import { useSelectArea } from "@/components/MapTools/SelectAreaContext";

const PANEL_WIDTH = "17.375rem";

const SMALL_TEXT = { fontSize: "0.75rem", lineHeight: 1.5 } as const;

const footerButtonSx = {
  flex: 1,
  height: "1.625rem",
  minWidth: 0,
  padding: "0 0.5rem",
  ...SMALL_TEXT,
  textTransform: "none",
  whiteSpace: "nowrap",
  "& .MuiButton-startIcon": { margin: "0 0.375rem 0 0" },
  "& .MuiButton-startIcon > svg": { fontSize: "1rem" },
} as const;

const EmptyState = () => {
  const theme = useTheme();

  return (
    <Box sx={{ padding: "0.75rem 1rem" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: "0.5rem",
          padding: "1rem 1.5rem",
          backgroundColor: INFO_FILL,
          border: `1px solid ${INFO_BORDER}`,
          borderRadius: `${theme.shape.borderRadius}px`,
        }}
      >
        <InfoOutlinedIcon
          sx={{
            flexShrink: 0,
            marginTop: "0.125rem",
            fontSize: "1.125rem",
            color: INFO_ICON,
          }}
        />
        <Typography sx={{ ...SMALL_TEXT, color: theme.palette.text.primary }}>
          Click projects or components on the map to add them.
        </Typography>
      </Box>
    </Box>
  );
};

const SelectedList = () => {
  const theme = useTheme();
  const { selected, remove, focusedId, focus } = useSelectArea();
  const navy = theme.palette.primary.main;

  return (
    <Box sx={{ padding: "0.75rem 1rem 0.5rem" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
        <Typography component="h2" sx={{ ...SMALL_TEXT, fontWeight: 700, color: navy }}>
          Selected
        </Typography>
        <Box
          component="span"
          sx={{
            padding: "0 0.5rem",
            ...SMALL_TEXT,
            fontWeight: 700,
            color: navy,
            backgroundColor: ACTIVE_FILL,
            borderRadius: `${theme.shape.borderRadius}px`,
          }}
        >
          {selected.length}
        </Box>
      </Box>

      <Box component="ul" sx={{ margin: "0.25rem 0 0", padding: 0, listStyle: "none" }}>
        {selected.map(({ featureId, label }) => {
          const focused = focusedId === featureId;
          return (
            <Box
              component="li"
              key={featureId}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.1875rem 0",
              }}
            >
              <ButtonBase
                aria-pressed={focused}
                onClick={() => focus(featureId)}
                sx={{
                  display: "block",
                  flexGrow: 1,
                  minWidth: 0,
                  textAlign: "left",
                  ...SMALL_TEXT,
                  fontWeight: focused ? 700 : 400,
                  color: focused ? navy : LINK,
                  borderRadius: `${theme.shape.borderRadius}px`,
                  "&:focus-visible": {
                    outline: `2px solid ${FOCUS_RING}`,
                    outlineOffset: "-2px",
                  },
                }}
              >
                {label}
              </ButtonBase>
              <IconButton
                aria-label={`Remove ${label}`}
                onClick={() => remove(featureId)}
                sx={{ padding: "0.25rem", color: theme.palette.text.primary }}
              >
                <CloseIcon sx={{ fontSize: "1.125rem" }} />
              </IconButton>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

/** The Select area panel under the tool bar. */
export default function SelectAreaPanel() {
  const theme = useTheme();
  const { selected, clear } = useSelectArea();
  const navy = theme.palette.primary.main;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        width: PANEL_WIDTH,
        marginTop: "0.5rem",
        backgroundColor: theme.palette.common.white,
        borderRadius: `${theme.shape.borderRadius}px`,
        boxShadow: theme.shadows[3],
      }}
    >
      {selected.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Box sx={{ minHeight: 0, overflowY: "auto" }}>
            <SelectedList />
          </Box>

          <Box
            sx={{
              display: "flex",
              flexShrink: 0,
              gap: "1rem",
              padding: "0.75rem 1rem",
              borderTop: `1px solid ${MENU_SEPARATOR}`,
            }}
          >
            <Button
              onClick={clear}
              sx={{
                ...footerButtonSx,
                border: `1px solid ${BORDER_DARK}`,
                color: theme.palette.text.primary,
                backgroundColor: theme.palette.common.white,
                "&:hover": { backgroundColor: HOVER_FILL },
              }}
            >
              Clear all
            </Button>
            {/* The query and its results are a later ticket. */}
            <Button
              startIcon={<SearchIcon />}
              sx={{
                ...footerButtonSx,
                border: `1px solid ${navy}`,
                color: theme.palette.primary.contrastText,
                backgroundColor: navy,
                "&:hover": { backgroundColor: theme.palette.primary.dark },
              }}
            >
              What&rsquo;s here
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
}
