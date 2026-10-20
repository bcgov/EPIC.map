import { describe, expect, it } from "vitest";
import { formatDate, stripMarkdown, truncate } from "@/utils/text";

describe("stripMarkdown", () => {
  it("keeps the readable half of a link and drops the markup", () => {
    expect(stripMarkdown("See [the *docs*](http://example.com) and `code`.")).toBe(
      "See the docs and code.",
    );
  });

  it("collapses the CRLF runs CKAN stores descriptions with", () => {
    expect(stripMarkdown("## Heading\r\n\r\nFirst line.\r\n> quoted")).toBe(
      "Heading First line. quoted",
    );
  });
});

describe("truncate", () => {
  it("leaves text shorter than the limit untouched", () => {
    expect(truncate("Short enough", 20)).toBe("Short enough");
  });

  it("cuts at a word boundary so no word is left half-written", () => {
    // The 20-char slice lands mid-"boundary"; the whole word goes.
    expect(truncate("Cut me at a word boundary please", 20)).toBe(
      "Cut me at a word…",
    );
  });
});

describe("formatDate", () => {
  it("writes a catalogue date the way the panel reads it", () => {
    expect(formatDate("2026-10-05")).toBe("Oct 5, 2026");
  });

  it("reads only the day off an ingest timestamp", () => {
    // map-api sends the UTC instant the extract was loaded; the panel shows
    // which day the layer is from, not the minute it landed.
    expect(formatDate("2026-10-05T09:00:00+00:00")).toBe("Oct 5, 2026");
  });

  it("keeps the day as written, rather than re-projecting it", () => {
    // Read at midday: parsing the instant itself would show Dec 31 in BC.
    expect(formatDate("2026-01-01T00:30:00+00:00")).toBe("Jan 1, 2026");
  });

  it("says nothing for a layer that has no date", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
    expect(formatDate("")).toBe("");
    expect(formatDate("not a date")).toBe("");
  });
});
