import { describe, expect, it } from "vitest";
import type { ProjectComponent } from "@/api/useProjects";
import {
  groupBy,
  groupComponents,
  submissionDate,
  submissionSources,
  submissionTitle,
} from "@/components/Projects/componentGrouping";

let nextId = 0;

const component = (overrides: Partial<ProjectComponent> = {}): ProjectComponent => ({
  featureId: `{F${(nextId += 1)}}`,
  label: "Access Route",
  componentType: "Project component",
  category: "Project Notification",
  subcategory: "Pre EA",
  number: null,
  source: "Proponent",
  comment: null,
  date: "2026-08-25",
  styleCategory: "project_component",
  sensitive: false,
  adjusted: false,
  footprint: false,
  ...overrides,
});

const onlySubmission = (components: ProjectComponent[]) => {
  const [group] = groupComponents(components);
  return group.submissions[0];
};

describe("groupBy", () => {
  it("keeps groups and their members in first-seen order", () => {
    expect(groupBy(["b1", "a1", "b2", "a2"], (value) => value[0])).toEqual([
      ["b1", "b2"],
      ["a1", "a2"],
    ]);
  });
});

describe("component type sections", () => {
  it("puts Project Components before Value Components, whatever the data's order", () => {
    const groups = groupComponents([
      component({ componentType: "Value component" }),
      component({ componentType: "Project component" }),
    ]);

    expect(groups.map(({ title }) => title)).toEqual([
      "Project Components",
      "Value Components",
    ]);
  });

  it("leaves out a type with no components", () => {
    const groups = groupComponents([component({ componentType: "Value component" })]);

    expect(groups.map(({ type }) => type)).toEqual(["Value component"]);
  });

  it("is empty for a project with nothing submitted", () => {
    expect(groupComponents([])).toEqual([]);
  });
});

describe("submissions", () => {
  it("groups by the category and subcategory pair", () => {
    const [group] = groupComponents([
      component({ category: "Post Decision", subcategory: "Amendment" }),
      component({ category: "Project Notification", subcategory: "Pre EA" }),
      component({ category: "Post Decision", subcategory: "Amendment" }),
    ]);

    expect(group.submissions.map(submissionTitle)).toEqual([
      "Post Decision · Amendment",
      "Project Notification · Pre EA",
    ]);
    expect(group.submissions[0].featureIds).toHaveLength(2);
  });

  it("treats a 'none' subcategory as no subcategory", () => {
    const [group] = groupComponents([
      component({ category: "Post Decision", subcategory: "None" }),
      component({ category: "Post Decision", subcategory: null }),
    ]);

    expect(group.submissions).toHaveLength(1);
    expect(submissionTitle(group.submissions[0])).toBe("Post Decision");
  });

  it("shows the number only for an amendment", () => {
    const amendment = onlySubmission([
      component({
        category: "Post Decision",
        subcategory: "Amendment",
        number: "Transmission line Amendment",
      }),
    ]);
    const other = onlySubmission([
      component({ subcategory: "Care and Maintenance", number: "Amendment 1" }),
    ]);

    expect(submissionTitle(amendment)).toBe(
      "Post Decision · Amendment · Transmission line Amendment",
    );
    expect(submissionTitle(other)).toBe("Project Notification · Care and Maintenance");
  });

  it("dates the submission D Mon YYYY, by its latest feature", () => {
    const submission = onlySubmission([
      component({ date: "2024-01-05" }),
      component({ date: "2026-08-25" }),
      component({ date: null }),
    ]);

    expect(submissionDate(submission)).toBe("25 Aug 2026");
  });

  it("lists each source once", () => {
    const submission = onlySubmission([
      component({ source: "Proponent" }),
      component({ source: "Catalogue" }),
      component({ source: "Proponent" }),
    ]);

    expect(submissionSources(submission)).toBe("Proponent, Catalogue");
  });

  it("uses placeholders where the date or source is not recorded", () => {
    const submission = onlySubmission([component({ date: null, source: null })]);

    expect(submissionDate(submission)).toBe("—");
    expect(submissionSources(submission)).toBe("not recorded");
  });
});

describe("labels and their comments", () => {
  it("makes each label one entry", () => {
    const submission = onlySubmission([
      component({ label: "Access Route" }),
      component({ label: "Falls Reservoir" }),
      component({ label: "Access Route" }),
    ]);

    expect(submission.labels.map(({ label }) => label)).toEqual([
      "Access Route",
      "Falls Reservoir",
    ]);
  });

  it("merges features that share a comment into one row", () => {
    const submission = onlySubmission([
      component({ comment: "Amendment 1" }),
      component({ comment: "Amendment 1" }),
    ]);

    const [{ variants }] = submission.labels;
    expect(variants).toHaveLength(1);
    expect(variants[0].comment).toBe("Amendment 1");
    expect(variants[0].features).toHaveLength(2);
  });

  it("merges features with no comment into one row", () => {
    const submission = onlySubmission([component(), component()]);

    expect(submission.labels[0].variants).toHaveLength(1);
  });

  it("keeps a row per distinct comment", () => {
    const submission = onlySubmission([
      component({ label: "Wildlife Habitat Area", comment: "Data sensitive" }),
      component({ label: "Wildlife Habitat Area", comment: "Pacific Water Shrew" }),
      component({ label: "Wildlife Habitat Area", comment: "Data sensitive" }),
    ]);

    expect(submission.labels[0].variants.map(({ comment }) => comment)).toEqual([
      "Data sensitive",
      "Pacific Water Shrew",
    ]);
  });
});
