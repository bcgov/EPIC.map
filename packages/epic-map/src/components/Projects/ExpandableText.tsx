import { useLayoutEffect, useRef, useState } from "react";
import { Link, Typography } from "@mui/material";
import {
  BODY_TEXT,
  LINK_COLOR,
  TEXT_COLOR,
} from "@/components/Projects/projectUtils";

type ExpandableTextProps = {
  text: string;
  /** Lines shown while collapsed. */
  lines: number;
  marginTop?: string;
};

/** Clamped with an ellipsis until expanded; the toggle only appears when there is more. */
export default function ExpandableText({
  text,
  lines,
  marginTop = "0.5rem",
}: ExpandableTextProps) {
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element || expanded) return;
    setTruncated(element.scrollHeight > element.clientHeight + 1);
  }, [text, expanded]);

  return (
    <>
      <Typography
        ref={textRef}
        sx={{
          marginTop,
          ...BODY_TEXT,
          color: TEXT_COLOR,
          ...(expanded
            ? {}
            : {
                display: "-webkit-box",
                WebkitLineClamp: lines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }),
        }}
      >
        {text}
      </Typography>
      {(truncated || expanded) && (
        <Link
          component="button"
          type="button"
          underline="hover"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          sx={{
            display: "block",
            marginTop: "0.25rem",
            ...BODY_TEXT,
            color: LINK_COLOR,
          }}
        >
          {expanded ? "Read Less" : "Read More"}
        </Link>
      )}
    </>
  );
}
