// @vitest-environment jsdom
//
// That the card draws the certificate tag it is given. Which tag that is, and
// the colour it carries, is certificateTag's own test in projectUtils.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

const state: { project: Project } = { project: PROJECT };

vi.mock("@/api/useProjects", () => ({
  useProject: () => ({ data: state.project, error: null, isLoading: false }),
}));

// Both reach for the widget's api client; what they draw is their own test.
vi.mock("@/components/Projects/MapLayersSection", () => ({
  default: () => <div />,
}));
vi.mock("@/components/Projects/WorksSection", () => ({
  default: () => <div />,
}));

const { default: ProjectCard } = await import(
  "@/components/Projects/ProjectCard"
);

const card = (certificate: Partial<Project>) => {
  state.project = { ...PROJECT, ...certificate };
  render(<ProjectCard projectId={7} point={null} onClose={vi.fn()} />);
};

beforeEach(() => {
  state.project = PROJECT;
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
