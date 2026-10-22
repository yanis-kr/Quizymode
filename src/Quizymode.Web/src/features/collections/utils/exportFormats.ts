/** Client-side collection export formats (#258). Pure functions over loaded items. */

export interface ExportableItem {
  question: string;
  correctAnswer: string;
  incorrectAnswers: readonly string[];
  explanation?: string | null;
}

export const INCORRECT_ANSWER_JOINER = " | ";
export const EXPORT_HEADER = ["question", "correct answer", "incorrect answers", "explanation"] as const;

/** Spreadsheet formula-injection guard: a leading ' makes Excel/Sheets treat the cell as text. */
const guardFormula = (value: string): string => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);

function quoteField(rawValue: string, separator: string): string {
  const value = guardFormula(rawValue);
  const needsQuotes =
    value.includes(separator) || value.includes('"') || value.includes("\n") || value.includes("\r");
  return needsQuotes ? `"${value.replace(/"/g, '""')}"` : value;
}

function toDelimited(items: readonly ExportableItem[], separator: string): string {
  const rows: string[][] = [
    [...EXPORT_HEADER],
    ...items.map((item) => [
      item.question,
      item.correctAnswer,
      item.incorrectAnswers.join(INCORRECT_ANSWER_JOINER),
      item.explanation ?? "",
    ]),
  ];
  return rows.map((row) => row.map((cell) => quoteField(cell, separator)).join(separator)).join("\r\n") + "\r\n";
}

export const toCsv = (items: readonly ExportableItem[]): string => toDelimited(items, ",");
export const toTsv = (items: readonly ExportableItem[]): string => toDelimited(items, "\t");

/** Quizlet's own export shape: term TAB definition, one card per line, no header, no quoting. */
export function toQuizletText(items: readonly ExportableItem[]): string {
  const flat = (value: string) => value.replace(/[\t\r\n]+/g, " ").trim();
  return items.map((item) => `${flat(item.question)}\t${flat(item.correctAnswer)}`).join("\n") + "\n";
}

export function exportFileName(collectionName: string | null | undefined, extension: string): string {
  const slug = (collectionName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${slug || "collection"}.${extension}`;
}

/** Triggers a browser download of text content. A BOM is added so spreadsheets read UTF-8 correctly. */
export function downloadTextFile(fileName: string, content: string, mimeType: string, withBom: boolean): void {
  const blob = new Blob([withBom ? `\uFEFF${content}` : content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
