/**
 * One-sentence landing descriptions for promoted scopes (#714, option a: a frontend map, no migration).
 * Keys are the URL path below /categories (for example "exams/aws/saa-c03"). Scopes not listed keep the
 * taxonomy text. Add a scope here only with reviewed copy.
 */
const PROMOTED_SCOPE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  "exams/aws/saa-c03": "Practice questions for the AWS Certified Solutions Architect Associate exam (SAA-C03).",
};

export function promotedScopeDescription(path: string): string | null {
  return Object.prototype.hasOwnProperty.call(PROMOTED_SCOPE_DESCRIPTIONS, path)
    ? PROMOTED_SCOPE_DESCRIPTIONS[path]
    : null;
}
