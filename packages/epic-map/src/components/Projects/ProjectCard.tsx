import type { ElementType, ReactNode } from "react";
import axios from "axios";
import { Box, Button, IconButton, Skeleton, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import BeachAccessIcon from "@mui/icons-material/BeachAccess";
import CategoryIcon from "@mui/icons-material/Category";
import CloseIcon from "@mui/icons-material/Close";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CommuteIcon from "@mui/icons-material/Commute";
import DeleteIcon from "@mui/icons-material/Delete";
import FactoryIcon from "@mui/icons-material/Factory";
import FlashOnIcon from "@mui/icons-material/FlashOn";
import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import TerrainIcon from "@mui/icons-material/Terrain";
import WaterDropIcon from "@mui/icons-material/WaterDrop";
import { useProject, type ProjectPoint } from "@/api/useProjects";
import {
  BODY_TEXT,
  certificateTag,
  glyphForType,
  type ProjectGlyph,
  SECONDARY_TEXT_COLOR,
  TAG_COLORS,
  type TagColors,
  TEXT_COLOR,
} from "@/components/Projects/projectUtils";
import ExpandableText from "@/components/Projects/ExpandableText";
import MapLayersSection from "@/components/Projects/MapLayersSection";
import WorksSection from "@/components/Projects/WorksSection";
import { PROJECT_CARD_WIDTH_PX } from "@/utils/config";

const GLYPH_ICONS: Record<ProjectGlyph, ElementType> = {
  terrain: TerrainIcon,
  flash_on: FlashOnIcon,
  local_gas_station: LocalGasStationIcon,
  water_drop: WaterDropIcon,
  commute: CommuteIcon,
  factory: FactoryIcon,
  delete: DeleteIcon,
  beach_access: BeachAccessIcon,
  category: CategoryIcon,
};

const DESCRIPTION_LINES = 2;

type ProjectTagProps = {
  colors: TagColors;
  icon?: ReactNode;
  children: ReactNode;
};

/** A 24px identity tag: type, region, or the certificate number or status. */
const ProjectTag = ({ colors, icon, children }: ProjectTagProps) => (
  <Box
    component="span"
    sx={{
      display: "inline-flex",
      alignItems: "center",
      gap: "0.375rem",
      maxWidth: "100%",
      height: "1.5rem",
      padding: "0 0.5rem",
      border: `1px solid ${colors.border}`,
      borderRadius: "2px",
      backgroundColor: colors.fill,
      color: TEXT_COLOR,
      fontSize: "0.75rem",
      lineHeight: "1rem",
      "& .MuiSvgIcon-root": { fontSize: "0.875rem", flexShrink: 0 },
    }}
  >
    {icon}
    <Box
      component="span"
      sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
    >
      {children}
    </Box>
  </Box>
);

type ProjectCardProps = {
  projectId: number;
  /** The dot's own properties, shown while the rest of the card loads. */
  point: ProjectPoint | null;
  onClose: () => void;
};

/** The selected project, docked on the map's right edge. */
export default function ProjectCard({
  projectId,
  point,
  onClose,
}: ProjectCardProps) {
  const theme = useTheme();
  const { data: project, error, isLoading } = useProject(projectId);

  const name = project?.name ?? point?.name;
  const typeName = project?.typeName ?? point?.typeName ?? null;
  const TypeIcon = GLYPH_ICONS[glyphForType(typeName)];
  const certificate = project ? certificateTag(project) : null;
  const notOpen =
    axios.isAxiosError(error) && error.response?.status === 404;

  const message = (text: string) => (
    <Typography
      sx={{ marginTop: "0.5rem", fontSize: "0.875rem", color: SECONDARY_TEXT_COLOR }}
    >
      {text}
    </Typography>
  );

  return (
    <Box
      role="dialog"
      aria-labelledby="epic-map-project-title"
      sx={{
        position: "absolute",
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 3,
        display: "flex",
        flexDirection: "column",
        width: `${PROJECT_CARD_WIDTH_PX}px`,
        maxWidth: "100%",
        backgroundColor: theme.palette.background.paper,
        boxShadow: theme.shadows[4],
      }}
    >
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <Box
          sx={{
            padding: "1rem 1rem 0.75rem",
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
            <Typography
              id="epic-map-project-title"
              component="h2"
              sx={{
                flexGrow: 1,
                minWidth: 0,
                fontSize: "1.125rem",
                fontWeight: 700,
                lineHeight: 1.5,
                color: TEXT_COLOR,
              }}
            >
              {name ?? <Skeleton width="70%" />}
            </Typography>
            <IconButton
              onClick={onClose}
              aria-label="Close project"
              sx={{ padding: 0, marginTop: "0.125rem", color: TEXT_COLOR }}
            >
              <CloseIcon sx={{ fontSize: "1.5rem" }} />
            </IconButton>
          </Box>

          {isLoading ? (
            <>
              <Skeleton width="50%" />
              <Skeleton variant="rounded" height="1.5rem" sx={{ my: "0.5rem" }} />
              <Skeleton />
              <Skeleton />
            </>
          ) : notOpen ? (
            message("This project is no longer open in EPIC.Track.")
          ) : error || !project ? (
            message("This project could not be loaded. Please try again.")
          ) : (
            <>
              {project.proponentName && (
                <Typography
                  sx={{
                    marginTop: "0.25rem",
                    ...BODY_TEXT,
                    color: SECONDARY_TEXT_COLOR,
                  }}
                >
                  {project.proponentName}
                </Typography>
              )}
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginTop: "0.5rem",
                }}
              >
                {typeName && (
                  <ProjectTag
                    colors={TAG_COLORS.type}
                    icon={<TypeIcon aria-hidden />}
                  >
                    {typeName}
                  </ProjectTag>
                )}
                {project.regionName && (
                  <ProjectTag
                    colors={TAG_COLORS.region}
                    icon={<PlaceOutlinedIcon aria-hidden />}
                  >
                    {project.regionName}
                  </ProjectTag>
                )}
                {certificate && (
                  <ProjectTag colors={certificate.colors}>
                    {certificate.text}
                  </ProjectTag>
                )}
              </Box>
              {project.description && (
                <ExpandableText text={project.description} lines={DESCRIPTION_LINES} />
              )}
            </>
          )}
        </Box>
        {project && !error && (
          <>
            <MapLayersSection projectId={projectId} />
            <WorksSection projectId={projectId} />
          </>
        )}
      </Box>
      {project?.epicUrl && !error && (
        <Box
          sx={{
            flexShrink: 0,
            padding: "1rem",
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Button
            component="a"
            href={project.epicUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="outlined"
            fullWidth
            startIcon={<OpenInNewIcon aria-hidden />}
            aria-label="View on EPIC (opens in a new tab)"
            sx={{
              height: "2.5rem",
              borderRadius: "0.25rem",
              borderColor: TEXT_COLOR,
              color: TEXT_COLOR,
              fontSize: "1rem",
              fontWeight: 400,
              textTransform: "none",
              "&:hover": { borderColor: TEXT_COLOR, backgroundColor: "#f3f2f1" },
              "& .MuiButton-startIcon > *:nth-of-type(1)": { fontSize: "1.25rem" },
            }}
          >
            View on EPIC
          </Button>
        </Box>
      )}
    </Box>
  );
}
