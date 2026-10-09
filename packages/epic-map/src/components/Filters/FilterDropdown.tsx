import { useMemo, useRef, useState } from "react";
import { Box, Button, Checkbox, Divider, Menu, MenuItem, Typography } from "@mui/material";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp";
import { useTheme } from "@mui/material/styles";
import { useFilters } from "@/components/Filters/FiltersContext";
import {
  allRowState,
  facetCounts,
  facetTotal,
  selectionFor,
  toggleAll,
  toggleOption,
  type FilterGroup,
  type FilterOption,
} from "@/components/Filters/filterUtils";
import {
  ACTIVE_FILL,
  ACTIVE_HOVER_FILL,
  BORDER_DEFAULT,
  CHECKBOX_BORDER,
  CONTROL_HEIGHT,
  DIMMED_TEXT,
  focusRing,
  HOVER_FILL,
  MENU_ROW_HEIGHT,
  MENU_ROW_HOVER_FILL,
  MENU_SEPARATOR,
  MENU_SHADOW,
  MENU_WIDTH,
} from "@/components/Filters/filterTokens";

type FilterDropdownProps = {
  /** The button's label, e.g. "Type". */
  label: string;
  /** The select-all row's label, e.g. "All Types". */
  allLabel: string;
  group: FilterGroup;
  options: readonly FilterOption[];
};

/** The square checkbox the design specifies, rather than MUI's default. */
const checkboxSx = {
  padding: 0,
  marginRight: "0.625rem",
  "& .MuiSvgIcon-root": { fontSize: "1rem" },
  color: CHECKBOX_BORDER,
  "&.Mui-checked, &.MuiCheckbox-indeterminate": { color: CHECKBOX_BORDER },
} as const;

/**
 * The checkbox draws the row's state; the row itself is the control.
 *
 * `readOnly` because the MenuItem's click is what changes it - without it React
 * warns about a `checked` input with no `onChange`. Hidden from assistive
 * technology because the row already carries `role="menuitemcheckbox"`, and
 * announcing a checkbox inside a checkable row describes two controls where
 * there is one.
 */
const checkboxProps = {
  readOnly: true,
  tabIndex: -1,
  disableRipple: true,
  inputProps: { tabIndex: -1, "aria-hidden": true },
} as const;

/**
 * A multi-select filter dropdown: the Type and Region controls.
 *
 * The counts beside the options are faceted - each is what that option would
 * yield given everything else already filtering - and they are recomputed while
 * the menu is open, so ticking one box updates the numbers beside the others.
 *
 * No option is ever hidden or disabled. One worth nothing is dimmed and shows
 * its 0, which tells the user the combination is empty without taking away the
 * control that would let them out of it.
 */
export default function FilterDropdown({
  label,
  allLabel,
  group,
  options,
}: FilterDropdownProps) {
  const theme = useTheme();
  const { projects, filters, setGroupSelection } = useFilters();

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);

  const selected = selectionFor(filters, group);

  const counts = useMemo(
    () => facetCounts(projects, filters, group),
    [projects, filters, group],
  );
  const total = facetTotal(counts);

  const allState = allRowState(selected, options);
  const active = selected.size > 0;

  return (
    <>
      <Button
        ref={anchorRef}
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-haspopup="true"
        aria-expanded={open}
        disableRipple
        endIcon={
          open ? (
            <KeyboardArrowUpIcon sx={{ fontSize: "1.25rem" }} />
          ) : (
            <KeyboardArrowDownIcon sx={{ fontSize: "1.25rem" }} />
          )
        }
        sx={{
          height: CONTROL_HEIGHT,
          padding: "0 0.5rem 0 0.75rem",
          borderRadius: `${theme.shape.borderRadius}px`,
          fontSize: theme.typography.body2.fontSize,
          fontWeight: theme.typography.fontWeightRegular,
          whiteSpace: "nowrap",
          textTransform: "none",
          ...(active
            ? {
                backgroundColor: ACTIVE_FILL,
                color: theme.palette.primary.main,
                // Heavier while open, as the design specifies. Drawn as an
                // inset shadow rather than a 2px border so the button does not
                // change size when the menu opens.
                border: `1px solid ${theme.palette.primary.main}`,
                boxShadow: open
                  ? `inset 0 0 0 1px ${theme.palette.primary.main}`
                  : "none",
                "&:hover": { backgroundColor: ACTIVE_HOVER_FILL },
              }
            : {
                backgroundColor: theme.palette.common.white,
                color: open
                  ? theme.palette.primary.main
                  : theme.palette.text.primary,
                border: `1px solid ${open ? theme.palette.primary.main : BORDER_DEFAULT}`,
                "&:hover": { backgroundColor: HOVER_FILL },
              }),
          ...focusRing,
        }}
      >
        {label}
        {active && (
          <Box
            component="span"
            aria-label={`${selected.size} selected`}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: "1.25rem",
              height: "1.25rem",
              marginLeft: "0.5rem",
              padding: "0 0.25rem",
              borderRadius: "0.625rem",
              backgroundColor: theme.palette.common.white,
              border: `1px solid ${theme.palette.primary.main}`,
              color: theme.palette.primary.main,
              fontSize: "0.75rem",
              fontWeight: theme.typography.fontWeightBold,
              lineHeight: 1,
            }}
          >
            {selected.size}
          </Box>
        )}
      </Button>

      <Menu
        anchorEl={anchorRef.current}
        open={open}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              width: MENU_WIDTH,
              marginTop: "0.25rem",
              borderRadius: `${theme.shape.borderRadius}px`,
              border: `1px solid ${BORDER_DEFAULT}`,
              boxShadow: MENU_SHADOW,
            },
          },
        }}
        MenuListProps={{ dense: true, sx: { paddingY: 0 } }}
      >
        <MenuItem
          onClick={() => setGroupSelection(group, toggleAll(selected, options))}
          role="menuitemcheckbox"
          aria-checked={allState === "all" ? true : allState === "some" ? "mixed" : false}
          sx={{
            height: MENU_ROW_HEIGHT,
            minHeight: MENU_ROW_HEIGHT,
            padding: "0 1rem",
            "&:hover": { backgroundColor: MENU_ROW_HOVER_FILL },
          }}
        >
          <Checkbox
            checked={allState === "all"}
            indeterminate={allState === "some"}
            {...checkboxProps}
            sx={checkboxSx}
          />
          <Typography
            sx={{
              flex: 1,
              fontSize: "0.75rem",
              fontWeight: theme.typography.fontWeightBold,
              color: theme.palette.text.primary,
            }}
          >
            {allLabel}
          </Typography>
          <Typography
            sx={{ fontSize: "0.75rem", color: theme.palette.text.primary }}
          >
            {total}
          </Typography>
        </MenuItem>

        <Divider sx={{ margin: 0, borderColor: MENU_SEPARATOR }} />

        {options.map((option) => {
          const count = counts.get(option.id) ?? 0;
          // Dimmed, never disabled: the user must always be able to tick and
          // untick it, which is often how they get back out of an empty map.
          const empty = count === 0;

          return (
            <MenuItem
              key={option.id}
              onClick={() =>
                setGroupSelection(group, toggleOption(selected, option.id))
              }
              role="menuitemcheckbox"
              aria-checked={selected.has(option.id)}
              sx={{
                height: MENU_ROW_HEIGHT,
                minHeight: MENU_ROW_HEIGHT,
                padding: "0 1rem",
                "&:hover": { backgroundColor: MENU_ROW_HOVER_FILL },
              }}
            >
              <Checkbox
                checked={selected.has(option.id)}
                {...checkboxProps}
                sx={{
                  ...checkboxSx,
                  ...(empty && {
                    color: DIMMED_TEXT,
                    "&.Mui-checked": { color: DIMMED_TEXT },
                  }),
                }}
              />
              <Typography
                sx={{
                  flex: 1,
                  fontSize: "0.75rem",
                  color: empty ? DIMMED_TEXT : theme.palette.text.primary,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {option.name}
              </Typography>
              <Typography
                sx={{
                  fontSize: "0.75rem",
                  paddingLeft: "0.5rem",
                  color: empty ? DIMMED_TEXT : theme.palette.text.primary,
                }}
              >
                {count}
              </Typography>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
