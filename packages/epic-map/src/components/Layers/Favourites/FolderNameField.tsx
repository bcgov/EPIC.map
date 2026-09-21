import { useEffect, useRef, useState } from "react";
import { InputBase } from "@mui/material";
import { useTheme } from "@mui/material/styles";

type FolderNameFieldProps = {
  /** Seeded once, on mount. The field owns the name from then on. */
  initialName: string;
  /** The name as committed. Blank is not refused - map-api names it for us. */
  onCommit: (name: string) => void;
  /** Escape: a new folder is discarded, an existing one keeps its name. */
  onCancel: () => void;
};

/**
 * The folder name, while it is being typed.
 *
 * Mounted only for the edit and seeded once, so a refetch landing mid-edit
 * cannot throw away what the user has typed.
 */
export default function FolderNameField({
  initialName,
  onCommit,
  onCancel,
}: FolderNameFieldProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Escape blurs the field; the blur must not commit what Escape discarded.
  const cancelled = useRef(false);

  useEffect(() => {
    // Pre-selected, so typing replaces the name.
    const field = inputRef.current;
    if (!field) return;
    field.focus();
    field.select();
  }, []);

  const commit = () => {
    if (cancelled.current) return;
    onCommit(draft);
  };

  const cancel = () => {
    cancelled.current = true;
    onCancel();
  };

  return (
    <InputBase
      inputRef={inputRef}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
      inputProps={{ "aria-label": "Folder name" }}
      sx={{
        flexGrow: 1,
        minWidth: 0,
        padding: "0.125rem 0.5rem",
        borderRadius: `${theme.shape.borderRadius}px`,
        border: `1px solid ${theme.palette.primary.main}`,
        backgroundColor: theme.palette.common.white,
        fontSize: theme.typography.body2.fontSize,
        fontWeight: theme.typography.fontWeightBold,
        color: theme.palette.text.primary,
      }}
    />
  );
}
