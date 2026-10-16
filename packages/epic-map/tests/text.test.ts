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
  it("shows a catalogue date the way the panel reads it", () => {
    expect(formatDate("2023-06-29")).toBe("Jun 29, 2023");
  });

  it("is empty for no date or an unparseable one", () => {
    expect(formatDate("")).toBe("");
    expect(formatDate("not a date")).toBe("");
  });
});
