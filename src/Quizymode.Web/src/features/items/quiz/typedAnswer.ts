import { toPlainText } from "@/utils/foreignPhrase";

/** Longest answer (in words) that the Type answer option accepts (AC 3.6.19). */
export const TYPEABLE_MAX_WORDS = 4;

export interface TypedAnswerResult {
  correct: boolean;
  /** 1 for an exact match after normalization, otherwise the best similarity to any accepted form (0 to 1). */
  closeness: number;
}

const LEADING_ARTICLES = new Set(["a", "an", "the"]);

/** Lowercase, accent-free, punctuation-free, article-free comparison form of `text` (markup stripped). */
export function normalizeTypedText(text: string): string {
  const words = toPlainText(text)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length > 1 && LEADING_ARTICLES.has(words[0])) words.shift();
  return words.join(" ");
}

/** Splits at `/` and the word `or`, ignoring separators inside parentheses. */
function splitAlternates(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (depth === 0) {
      if (char === "/") {
        parts.push(current);
        current = "";
        continue;
      }
      const orMatch = /^\s+or\s+/i.exec(text.slice(index));
      if (orMatch) {
        parts.push(current);
        current = "";
        index += orMatch[0].length - 1;
        continue;
      }
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

/** A part such as "Color (Colour)" accepts "color", "color colour" and "colour". */
function expandParentheses(part: string): string[] {
  const inner = Array.from(part.matchAll(/\(([^()]*)\)/g)).map((match) => match[1]);
  const without = part.replace(/\([^()]*\)/g, " ");
  const inlined = part.replace(/[()]/g, " ");
  return [without, inlined, ...inner];
}

/** Every normalized form of `correctAnswer` that counts as right. */
export function acceptedForms(correctAnswer: string): string[] {
  const plain = toPlainText(correctAnswer);
  const raw = [plain, ...splitAlternates(plain).flatMap(expandParentheses)];
  const forms = new Set<string>();
  for (const value of raw) {
    const normalized = normalizeTypedText(value);
    if (normalized) forms.add(normalized);
  }
  if (forms.size === 0) {
    const fallback = plain.trim().toLowerCase();
    if (fallback) forms.add(fallback);
  }
  return Array.from(forms);
}

/** True when the answer is at most four words, all letters Latin, once markup is stripped (AC 3.6.19). */
export function isTypeable(item: { correctAnswer?: string | null }): boolean {
  const plain = toPlainText(item.correctAnswer ?? "").trim();
  if (!plain) return false;
  if (/\p{L}/u.test(plain.replace(/\p{Script=Latin}/gu, ""))) return false;
  return plain.split(/\s+/).length <= TYPEABLE_MAX_WORDS;
}

export function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const substitution = previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1);
      current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, substitution);
    }
    previous = current;
  }
  return previous[right.length];
}

/** Typos allowed for an expected word: none under 4 letters or with digits, 1 for 4-7 letters, 2 beyond. */
export function typoAllowance(expectedWord: string): number {
  if (/\d/.test(expectedWord) || expectedWord.length < 4) return 0;
  return expectedWord.length <= 7 ? 1 : 2;
}

function matchesWithTypos(typed: string, expected: string): boolean {
  const typedWords = typed.split(" ");
  const expectedWords = expected.split(" ");
  if (typedWords.length !== expectedWords.length) return false;
  return expectedWords.every(
    (word, index) => levenshtein(typedWords[index], word) <= typoAllowance(word),
  );
}

function similarity(left: string, right: string): number {
  const longest = Math.max(left.length, right.length);
  return longest === 0 ? 1 : 1 - levenshtein(left, right) / longest;
}

/** Lenient grading of a typed answer against the item's correct answer (AC 3.6.19). */
export function gradeTypedAnswer(typed: string, correctAnswer: string): TypedAnswerResult {
  const normalizedTyped = normalizeTypedText(typed) || typed.trim().toLowerCase();
  if (!normalizedTyped) return { correct: false, closeness: 0 };
  const forms = acceptedForms(correctAnswer);
  if (forms.includes(normalizedTyped)) return { correct: true, closeness: 1 };
  const correct = forms.some((form) => matchesWithTypos(normalizedTyped, form));
  const closeness = Math.max(0, ...forms.map((form) => similarity(normalizedTyped, form)));
  return { correct, closeness: correct ? Math.min(closeness, 0.99) : closeness };
}
