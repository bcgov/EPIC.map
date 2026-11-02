import { Box, Button, ButtonBase, CircularProgress, IconButton, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import SearchIcon from "@mui/icons-material/Search";
import { useTheme } from "@mui/material/styles";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useWhatsHereApi } from "@/api/useWhatsHere";
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
import { useLayers } from "@/components/Layers/LayersContext";
import { useImportedLayersContext } from "@/components/Layers/UserLayers/ImportedLayersContext";
import {
  useSelectArea,
  type ResultFeature,
  type ResultGroup,
} from "@/components/MapTools/SelectAreaContext";
import WhatsHereResults from "@/components/MapTools/WhatsHereResults";
import { searchedLayers, toGroups, whatsHereRequest } from "@/components/MapTools/whatsHere";

const PANEL_WIDTH = "17.375rem";

const SMALL_TEXT = { fontSize: "0.75rem", lineHeight: 1.5 } as const;

export const SELECT_AREA_HINT = "Click projects or components on the map to add them.";

const NO_LAYERS_MESSAGE = "Switch on a layer in the Layers panel to see what is here.";
const FAILED_MESSAGE = "The layers could not be searched. Please try again.";

const footerButtonSx = {
  // Half the row each, so a lone button keeps its size.
  flex: "0 0 calc(50% - 0.5rem)",
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
          {SELECT_AREA_HINT}
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

/** Runs What's here over the switched-on layers. */
const useRunWhatsHere = () => {
  const { selected, startQuery, finishQuery, failQuery } = useSelectArea();
  const { appliedLayers, favourites, visibleIds } = useLayers();
  const { layers: importedLayers, shownIds: importedShownIds } = useImportedLayersContext();
  const { search } = useWhatsHereApi();

  return () => {
    const layers = searchedLayers({
      appliedLayers,
      favourites,
      visibleIds,
      importedLayers,
      importedShownIds,
    });
    const queryId = startQuery();
    if (layers.length === 0) {
      failQuery(queryId, NO_LAYERS_MESSAGE);
      return;
    }
    search(whatsHereRequest(selected.map(({ featureId }) => featureId), layers))
      .then((results) => finishQuery(queryId, toGroups(results, layers)))
      .catch(() => failQuery(queryId, FAILED_MESSAGE));
  };
};

/** The Select area panel under the tool bar. */
export default function SelectAreaPanel({ map }: { map: MapLibreMap | null }) {
  const theme = useTheme();
  const { selected, results, queryId, clear, showInfo } = useSelectArea();
  const runWhatsHere = useRunWhatsHere();
  const navy = theme.palette.primary.main;
  const querying = queryId !== null;
  const hasFeatures = results?.some(({ features }) => features.length > 0) ?? false;

  // Left of the panel, level with the row.
  const openInfo = (group: ResultGroup, feature: ResultFeature, row: HTMLElement) => {
    if (!map) return;
    const container = map.getContainer().getBoundingClientRect();
    const { left, top } = row.getBoundingClientRect();
    showInfo({
      groupKey: group.key,
      featureKey: feature.key,
      right: left - container.left,
      top: top - container.top,
    });
  };

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
            <WhatsHereResults onInfo={openInfo} />
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
            {results === null ? (
              <Button
                onClick={runWhatsHere}
                disabled={querying}
                startIcon={
                  querying ? <CircularProgress size="1rem" color="inherit" /> : <SearchIcon />
                }
                sx={{
                  ...footerButtonSx,
                  border: `1px solid ${navy}`,
                  color: theme.palette.primary.contrastText,
                  backgroundColor: navy,
                  "&:hover": { backgroundColor: theme.palette.primary.dark },
                  "&.Mui-disabled": { color: theme.palette.primary.contrastText, opacity: 0.7 },
                }}
              >
                What&rsquo;s here
              </Button>
            ) : (
              hasFeatures && (
                // Export is a later ticket.
                <Button
                  startIcon={<SaveAltIcon />}
                  sx={{
                    ...footerButtonSx,
                    border: `1px solid ${navy}`,
                    color: theme.palette.primary.contrastText,
                    backgroundColor: navy,
                    "&:hover": { backgroundColor: theme.palette.primary.dark },
                  }}
                >
                  Export
                </Button>
              )
            )}
          </Box>
        </>
      )}
    </Box>
  );
}
