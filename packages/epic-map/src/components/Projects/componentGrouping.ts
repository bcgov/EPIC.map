import type { ComponentType, ProjectComponent } from "@/api/useProjects";
import { formatCalendarDate } from "@/components/Projects/projectUtils";

/** The panel's sections, in the order they are shown. */
const COMPONENT_TYPE_SECTIONS: ReadonlyArray<{
  type: ComponentType;
  title: string;
}> = [
  { type: "Project component", title: "Project Components" },
  { type: "Value component", title: "Value Components" },
];

/** A label's features that share one comment, shown as one row. */
export interface CommentVariant {
  comment: string | null;
  features: ProjectComponent[];
}

export interface LabelGroup {
  label: string;
  variants: CommentVariant[];
}

export interface Submission {
  key: string;
  category: string | null;
  subcategory: string | null;
  /** Shown only for an amendment. */
  number: string | null;
  /** The latest date among its features, YYYY-MM-DD. */
  date: string | null;
  sources: string[];
  featureIds: string[];
  labels: LabelGroup[];
}

export interface ComponentTypeGroup {
  type: ComponentType;
  title: string;
  submissions: Submission[];
}

/** Groups in first-seen order, so the order map-api returned carries through. */
export const groupBy = <T>(
  items: readonly T[],
  keyOf: (item: T) => string,
): T[][] => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
};

const unique = (values: ReadonlyArray<string | null>): string[] => [
  ...new Set(values.filter((value): value is string => Boolean(value))),
];

/** The delivery writes "none" where there is no subcategory. */
const subcategoryOf = ({ subcategory }: ProjectComponent): string | null =>
  subcategory && subcategory.trim().toLowerCase() !== "none" ? subcategory : null;

const isAmendment = (subcategory: string | null) =>
  subcategory?.trim().toLowerCase() === "amendment";

const submissionKey = (component: ProjectComponent) =>
  [component.componentType, component.category ?? "", subcategoryOf(component) ?? ""].join("|");

const latestDate = (features: readonly ProjectComponent[]): string | null =>
  features.reduce<string | null>(
    (latest, { date }) => (date && (!latest || date > latest) ? date : latest),
    null,
  );

const toLabelGroup = (features: ProjectComponent[]): LabelGroup => ({
  label: features[0].label,
  variants: groupBy(features, ({ comment }) => comment ?? "").map((same) => ({
    comment: same[0].comment,
    features: same,
  })),
});

const toSubmission = (features: ProjectComponent[]): Submission => {
  const subcategory = subcategoryOf(features[0]);
  return {
    key: submissionKey(features[0]),
    category: features[0].category,
    subcategory,
    number: isAmendment(subcategory)
      ? unique(features.map(({ number }) => number)).join(", ") || null
      : null,
    date: latestDate(features),
    sources: unique(features.map(({ source }) => source)),
    featureIds: features.map(({ featureId }) => featureId),
    labels: groupBy(features, ({ label }) => label).map(toLabelGroup),
  };
};

/** Component type, then submission, then label, then comment. Empty types are left out. */
export const groupComponents = (
  components: readonly ProjectComponent[],
): ComponentTypeGroup[] =>
  COMPONENT_TYPE_SECTIONS.map(({ type, title }) => ({
    type,
    title,
    submissions: groupBy(
      components.filter((component) => component.componentType === type),
      submissionKey,
    ).map(toSubmission),
  })).filter(({ submissions }) => submissions.length > 0);

/** "Category · Subcategory · Number", leaving out whichever is absent. */
export const submissionTitle = ({ category, subcategory, number }: Submission) =>
  [category, subcategory, number].filter(Boolean).join(" · ") || "—";

export const submissionDate = ({ date }: Submission) =>
  (date && formatCalendarDate(date)) || "—";

export const submissionSources = ({ sources }: Submission) =>
  sources.join(", ") || "not recorded";
