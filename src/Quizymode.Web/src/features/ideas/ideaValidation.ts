/**
 * Client-side mirror of the backend Ideas text rules
 * (IdeaFeatureSupport.CountMeaningfulCharacters, IdeaCrud.ValidateNormalizedFields,
 * IdeaComments create/update validation) so errors surface inline before submit.
 */

export const IDEA_TITLE_MAX = 200;
export const IDEA_TEXT_MAX = 4000;
export const IDEA_COMMENT_MAX = 2000;

export const IDEA_TITLE_MIN_MEANINGFUL = 3;
export const IDEA_TEXT_MIN_MEANINGFUL = 10;
export const IDEA_COMMENT_MIN_MEANINGFUL = 3;

const LETTER_OR_DIGIT = /[\p{L}\p{Nd}]/u;

/**
 * Counts letters and decimal digits, matching .NET `char.IsLetterOrDigit` per UTF-16
 * code unit (characters outside the Basic Multilingual Plane are surrogate pairs in
 * .NET and are not counted there, so they are not counted here either).
 */
export function countMeaningfulCharacters(value: string): number {
  let count = 0;
  for (const character of value) {
    if (character.length === 1 && LETTER_OR_DIGIT.test(character)) {
      count += 1;
    }
  }
  return count;
}

export type IdeaFormField = "title" | "problem" | "proposedChange" | "tradeOffs";

const FIELD_RULES: Record<
  IdeaFormField,
  { label: string; minMeaningful: number; max: number; optional: boolean }
> = {
  title: { label: "Title", minMeaningful: IDEA_TITLE_MIN_MEANINGFUL, max: IDEA_TITLE_MAX, optional: false },
  problem: { label: "Problem", minMeaningful: IDEA_TEXT_MIN_MEANINGFUL, max: IDEA_TEXT_MAX, optional: false },
  proposedChange: {
    label: "Proposed change",
    minMeaningful: IDEA_TEXT_MIN_MEANINGFUL,
    max: IDEA_TEXT_MAX,
    optional: false,
  },
  tradeOffs: { label: "Trade-offs", minMeaningful: IDEA_TEXT_MIN_MEANINGFUL, max: IDEA_TEXT_MAX, optional: true },
};

export function getIdeaFieldError(field: IdeaFormField, value: string): string | null {
  const rule = FIELD_RULES[field];
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return rule.optional ? null : `${rule.label} is required.`;
  }

  if (trimmed.length > rule.max) {
    return `${rule.label} is too long (${trimmed.length}/${rule.max}).`;
  }

  if (countMeaningfulCharacters(trimmed) < rule.minMeaningful) {
    return `${rule.label} must contain at least ${rule.minMeaningful} letters or digits${
      rule.optional ? " when provided" : ""
    }.`;
  }

  return null;
}

export function getIdeaCommentError(value: string): string | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return "Comment is required.";
  }

  if (trimmed.length > IDEA_COMMENT_MAX) {
    return `Comment is too long (${trimmed.length}/${IDEA_COMMENT_MAX}).`;
  }

  if (countMeaningfulCharacters(trimmed) < IDEA_COMMENT_MIN_MEANINGFUL) {
    return `Comment must contain at least ${IDEA_COMMENT_MIN_MEANINGFUL} letters or digits.`;
  }

  return null;
}
