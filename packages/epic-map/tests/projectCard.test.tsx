// @vitest-environment jsdom
//
// That the card draws the certificate tag it is given and pins its header.
// Which tag, and its colour, is certificateTag's own test in projectUtils.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Project } from "@/api/useProjects";

const PROJECT: Project = {
  id: 7,
  name: "Morrison Copper/Gold Mine",
  typeId: 1,
  typeName: "Mines",
  regionId: 2,
  regionName: "Skeena",
  certificateIssued: false,
  hasWorksInProgress: true,
  description: "An open pit mine",
  proponentName: "Pacific Booker Minerals Inc.",
  eaCertificate: null,
  certificateStatus: null,
  epicUrl: null,
  longitude: -126.2,
  latitude: 54.7,
};

const state: { project: Project; error: Error | null } = {
  project: PROJECT,
  error: null,
};

vi.mock("@/api/useProjects", () => ({
  useProject: () => ({
    data: state.project,
    error: state.error,
    isLoading: false,
  }),
}));

// Both reach for the widget's api client; what they draw is their own test.
vi.mock("@/components/Projects/MapLayersSection", () => ({
  default: () => <div data-testid="map-layers" />,
}));
vi.mock("@/components/Projects/WorksSection", () => ({
  default: () => <div />,
}));

const { default: ProjectCard } = await import(
  "@/components/Projects/ProjectCard"
);

const card = (certificate: Partial<Project> = {}) => {
  state.project = { ...PROJECT, ...certificate };
  const onClose = vi.fn();
  render(
    <ProjectCard projectId={7} point={null} onClose={onClose} map={null} />,
  );
  return onClose;
};

/** Mirrors scrollIntoNearestView's container lookup. */
const scroller = (element: HTMLElement) => {
  let node = element.parentElement;
  while (node && !["auto", "scroll"].includes(getComputedStyle(node).overflowY)) {
    node = node.parentElement;
  }
  return node;
};

beforeEach(() => {
  state.project = PROJECT;
  state.error = null;
});
afterEach(cleanup);

describe("the card's certificate tag", () => {
  it("shows a certificate number with its prefix", () => {
    card({ eaCertificate: "M23-01", certificateIssued: true });

    expect(screen.getByText("Certificate # M23-01")).toBeDefined();
  });

  /**
   * The gap this closes: a status used to reach the card as a blank
   * certificate field, so a project whose certificate was refused or withdrawn
   * said nothing about it at all. Only a number has counted as issued since
   * c3b0f6d; what was missing was somewhere for the status itself to go.
   */
  it("shows a status on its own, with no number and no prefix", () => {
    card({ certificateStatus: "Certificate Refused" });

    expect(screen.getByText("Certificate Refused")).toBeDefined();
    expect(screen.queryByText(/Certificate #/)).toBeNull();
  });

  it("shows no tag when the field is empty", () => {
    card({});

    expect(screen.queryByText(/Certificate/)).toBeNull();
  });
});

describe("the card's pinned header", () => {
  /** Not sticky, which would hide a row MAP-100 scrolls to behind it. */
  it("keeps the name, proponent and close out of the scrolling body", () => {
    card();
    const body = scroller(screen.getByTestId("map-layers"));
    const inBody = (element: HTMLElement) => body?.contains(element);

    expect(inBody(screen.getByText("Mines"))).toBe(true);
    expect(inBody(screen.getByRole("heading", { name: PROJECT.name }))).toBe(false);
    expect(inBody(screen.getByText("Pacific Booker Minerals Inc."))).toBe(false);
    expect(inBody(screen.getByRole("button", { name: "Close project" }))).toBe(false);
  });

  it("drops the proponent when a refetch fails over cached data", () => {
    state.error = new Error("Network Error");
    card();

    expect(
      screen.getByText("This project could not be loaded. Please try again."),
    ).toBeDefined();
    expect(screen.queryByText("Pacific Booker Minerals Inc.")).toBeNull();
  });

  it("closes the card from the header", async () => {
    const onClose = card();

    await userEvent.click(screen.getByRole("button", { name: "Close project" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
