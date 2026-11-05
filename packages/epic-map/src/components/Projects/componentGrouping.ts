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

export type ComponentFlag = "sensitive" | "adjusted";

/** A label's features that share one comment, shown as one row. */
export interface CommentVariant {
  /** Its first feature's id: a feature belongs to one variant only. */
  key: string;
  comment: string | null;
  features: ProjectComponent[];
  featureIds: string[];
  flag: ComponentFlag | null;
}

export interface LabelGroup {
  label: string;
  featureIds: string[];
  variants: CommentVariant[];
}

export interface Submission {
  key: string;
  category: string | null;
  subcategory: string | null;
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
const subcategoryOf = ({ subcategory }: ProjectComponent): string | null => {
  const value = subcategory?.trim();
  return value && value.toLowerCase() !== "none" ? value : null;
};

const isAmendment = (subcategory: string | null) =>
  subcategory?.trim().toLowerCase() === "amendment";

const amendmentNumber = (component: ProjectComponent) =>
  isAmendment(subcategoryOf(component)) ? component.number : null;

const submissionKey = (component: ProjectComponent) =>
  [
    component.componentType,
    component.category,
    subcategoryOf(component),
    amendmentNumber(component),
  ]
    .map((part) => (part ?? "").trim().toLowerCase())
    .join("|");

const idsOf = (features: readonly ProjectComponent[]) =>
  features.map(({ featureId }) => featureId);

const latestDate = (features: readonly ProjectComponent[]): string | null =>
  features.reduce<string | null>(
    (latest, { date }) => (date && (!latest || date > latest) ? date : latest),
    null,
  );

/** Sensitive wins: a sensitive row is never also shown as adjusted. */
const flagOf = (features: readonly ProjectComponent[]): ComponentFlag | null => {
  if (features.some(({ sensitive }) => sensitive)) return "sensitive";
  if (features.some(({ adjusted }) => adjusted)) return "adjusted";
  return null;
};

/** Numbers by value: "Year 5" before "Year 15". Case only breaks ties. */
const naturalOrder = new Intl.Collator("en", { numeric: true }).compare;

const commentOrder = (a: CommentVariant, b: CommentVariant) =>
  naturalOrder(a.comment ?? "", b.comment ?? "");

const toLabelGroup = (features: ProjectComponent[]): LabelGroup => ({
  label: features[0].label,
  featureIds: idsOf(features),
  variants: groupBy(features, ({ comment }) => comment ?? "")
    .map((same) => ({
      key: same[0].featureId,
      comment: same[0].comment,
      features: same,
      featureIds: idsOf(same),
      flag: flagOf(same),
    }))
    .sort(commentOrder),
});

const isFootprint = ({ variants }: LabelGroup) =>
  variants.some(({ features }) => features.some(({ footprint }) => footprint));

/** The project's boundary first, then the rest in natural order. */
const labelOrder = (a: LabelGroup, b: LabelGroup) =>
  Number(isFootprint(b)) - Number(isFootprint(a)) ||
  naturalOrder(a.label, b.label);

const toSubmission = (features: ProjectComponent[]): Submission => {
  const subcategory = subcategoryOf(features[0]);
  return {
    key: submissionKey(features[0]),
    category: features[0].category,
    subcategory,
    number: amendmentNumber(features[0]),
    date: latestDate(features),
    sources: unique(features.map(({ source }) => source)),
    featureIds: idsOf(features),
    labels: groupBy(features, ({ label }) => label)
      .map(toLabelGroup)
      .sort(labelOrder),
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

export const findVariant = (
  groups: readonly ComponentTypeGroup[],
  key: string | null,
): CommentVariant | undefined =>
  groups
    .flatMap(({ submissions }) => submissions)
    .flatMap(({ labels }) => labels)
    .flatMap(({ variants }) => variants)
    .find((variant) => variant.key === key);

/** Where a feature's row sits in the list. */
export interface RowPlace {
  type: ComponentType;
  submissionKey: string;
  labelIndex: number;
  variantKey: string;
}

/** Each feature's row, by feature id. */
export const rowPlaces = (
  groups: readonly ComponentTypeGroup[],
): ReadonlyMap<string, RowPlace> => {
  const places = new Map<string, RowPlace>();
  for (const { type, submissions } of groups) {
    for (const { key: submissionKey, labels } of submissions) {
      labels.forEach(({ variants }, labelIndex) => {
        for (const { key: variantKey, featureIds } of variants) {
          const place = { type, submissionKey, labelIndex, variantKey };
          featureIds.forEach((id) => places.set(id, place));
        }
      });
    }
  }
  return places;
};

/** "Category · Subcategory · Number", leaving out whichever is absent. */
export const submissionTitle = ({ category, subcategory, number }: Submission) =>
  [category, subcategory, number].filter(Boolean).join(" · ") || "—";

export const submissionDate = ({ date }: Submission) =>
  (date && formatCalendarDate(date)) || "—";

export const submissionSources = ({ sources }: Submission) =>
  sources.join(", ") || "not recorded";
