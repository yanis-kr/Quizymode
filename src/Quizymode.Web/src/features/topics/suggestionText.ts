/** The API rejects longer text; mirrors MAX_SUGGEST_TEXT_LENGTH in api/taxonomy.ts (kept local so API mocks stay small). */
const MAX_SUGGEST_TEXT_LENGTH = 5000;

/** Only this much of a .txt/.md file is read in the browser to suggest a topic. */
export const SUGGESTION_FILE_SAMPLE_BYTES = 20_000;
/** Import suggestions use the question and answer of the first rows only. */
export const SUGGESTION_IMPORT_ROWS = 20;

export const BINARY_FILE_HELPER = "Topic suggestions use your title and file name for this file type.";

const TEXT_EXTENSIONS = new Set([".txt", ".md"]);

function join(parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => part?.trim() ?? "")
    .filter((part) => part.length > 0)
    .join("\n")
    .slice(0, MAX_SUGGEST_TEXT_LENGTH);
}

/** Create item: the question, correct answer and explanation. */
export function composeItemSuggestionText(question: string, correctAnswer: string, explanation: string): string {
  return join([question, correctAnswer, explanation]);
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

function stemOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  return stem.replace(/[_\-.]+/g, " ");
}

/** True for files whose content the browser can read as text (.txt, .md); others only give a title and file name. */
export function isReadableTextFile(fileName: string): boolean {
  return TEXT_EXTENSIONS.has(extensionOf(fileName));
}

/** Reads at most the first 20,000 bytes of a .txt/.md file. Returns "" when the browser cannot read it. */
export async function readFileSample(file: File): Promise<string> {
  try {
    return await file.slice(0, SUGGESTION_FILE_SAMPLE_BYTES).text();
  } catch {
    return "";
  }
}

/** Notes upload: the title plus the pasted text, the sampled file content, or the file name stem for other types. */
export function composeNotesSuggestionText(options: {
  mode: "file" | "text";
  title: string;
  pastedText: string;
  fileName: string | null;
  fileSample: string;
}): string {
  if (options.mode === "text") {
    return join([options.title, options.pastedText]);
  }
  if (!options.fileName) {
    return join([options.title]);
  }
  if (isReadableTextFile(options.fileName)) {
    return join([options.title, options.fileSample]);
  }
  return join([options.title, stemOf(options.fileName)]);
}

interface QuestionAnswer {
  question?: unknown;
  correctAnswer?: unknown;
}

function rowText(row: QuestionAnswer): string {
  return `${typeof row.question === "string" ? row.question : ""} ${typeof row.correctAnswer === "string" ? row.correctAnswer : ""}`;
}

/** Import: question and answer of the first 20 rows. */
export function composeImportSuggestionText(rows: QuestionAnswer[]): string {
  return join(rows.slice(0, SUGGESTION_IMPORT_ROWS).map(rowText));
}

/** Import, JSON tab: the rows of the pasted JSON array; unparseable JSON gives no text. */
export function composeJsonSuggestionText(jsonText: string): string {
  if (!jsonText.trim()) return "";
  try {
    const parsed: unknown = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return "";
    return composeImportSuggestionText(
      parsed.filter((row): row is QuestionAnswer => typeof row === "object" && row !== null)
    );
  } catch {
    return "";
  }
}
