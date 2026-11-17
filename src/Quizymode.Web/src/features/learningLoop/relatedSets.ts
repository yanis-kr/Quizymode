/**
 * Hand-written "Keep going" map (#711). Keys are scope paths below /categories as `category/kw/kw` (the same shape as
 * the taxonomy). Every target must exist in docs/quizymode_taxonomy.yaml; a unit test checks this.
 * A scope missing from the map falls back to the existing ranked recommendations (useExploreNextSets).
 */
export interface RelatedSetRef {
  /** Scope path: category followed by its navigation keywords. */
  scope: string;
  /** Tile title (the human set name). */
  label: string;
}

export interface RelatedSets {
  /** Up to two sets on the same topic. */
  related: RelatedSetRef[];
  /** Optional lighter set shown under "Change of pace" (exam and tech scopes only). */
  changeOfPace?: RelatedSetRef;
}

const SAA_C03 = "exams/aws/saa-c03";
const DVA_C02 = "exams/aws/dva-c02";
const SAP_C02 = "exams/aws/sap-c02";
const SOA_C02 = "exams/aws/soa-c02";

export const RELATED_SETS: Readonly<Record<string, RelatedSets>> = {
  [SAA_C03]: {
    related: [
      { scope: SAP_C02, label: "AWS Solutions Architect Professional (SAP-C02)" },
      { scope: DVA_C02, label: "AWS Developer Associate (DVA-C02)" },
    ],
    changeOfPace: { scope: "tech/ai-ml", label: "AI and machine learning" },
  },
  [DVA_C02]: {
    related: [
      { scope: SAA_C03, label: "AWS Solutions Architect Associate (SAA-C03)" },
      { scope: SOA_C02, label: "AWS SysOps Administrator (SOA-C02)" },
    ],
    changeOfPace: { scope: "tech/cloud", label: "Cloud" },
  },
};

/** The related sets for a scope path, or null when the scope is not in the map. */
export function relatedSetsFor(scope: string): RelatedSets | null {
  return Object.prototype.hasOwnProperty.call(RELATED_SETS, scope) ? RELATED_SETS[scope] : null;
}

/** Exam and tech scopes get the "Change of pace" label; other scopes show their tiles without it (AC3). */
export function showsChangeOfPace(scope: string): boolean {
  const category = scope.split("/")[0];
  return category === "exams" || category === "tech";
}
