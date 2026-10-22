/**
 * Pure parser for pasted study text (Quizlet export, Anki .txt, CSV, TSV) (#257).
 * No network, no scraping: it only turns text into upload-ready items.
 */

export const MAX_QUESTION_LENGTH = 1000;
export const MAX_ANSWER_LENGTH = 200;
export const MIN_USABLE_ROWS = 4;
export const MAX_DISTRACTORS = 3;
export const NON_ADMIN_ITEM_LIMIT = 100;
export const ADMIN_ITEM_LIMIT = 1000;

export type SeparatorKind = "auto" | "tab" | "comma" | "semicolon" | "pipe" | "custom";
export type ImportDirection = "term-to-definition" | "definition-to-term";

export interface ParseOptions {
  separator: SeparatorKind;
  /** Used when separator is "custom". May be several characters. */
  customSeparator?: string;
  /** Recognise "double-quoted" fields (CSV style). */
  quotes: boolean;
  stripHtml: boolean;
}

export const DEFAULT_PARSE_OPTIONS: ParseOptions = {
  separator: "auto",
  customSeparator: "",
  quotes: true,
  stripHtml: true,
};

export interface TermPair {
  term: string;
  definition: string;
  /** 1-based row number among parsed records, for messages. */
  row: number;
}

export interface SkippedRow {
  row: number;
  reason: string;
}

export interface ParseResult {
  pairs: TermPair[];
  skipped: SkippedRow[];
  separatorUsed: string;
}

export interface ImportItem {
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  explanation: string;
}

export interface BuildOptions {
  direction: ImportDirection;
  /** Question template; `{term}` is replaced by the prompt side. Default "{term}". */
  template: string;
  /** Maximum number of items to return (the user's upload limit). */
  limit: number;
}

export interface BuildResult {
  items: ImportItem[];
  skipped: SkippedRow[];
  /** Set when the import cannot proceed (for example fewer than 4 usable rows). */
  error: string | null;
  /** Items dropped because of the upload limit. */
  truncated: number;
  /** Rows dropped as duplicates within this batch. */
  duplicates: number;
}

const ANKI_HEADER = /^#(?:separator|html|columns|notetype|deck|guid|tags)(?: column)?\s*:/i;
const HEADER_FIRST = "question";
const HEADER_SECOND = "correct answer";

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function stripHtml(value: string): string {
  const withBreaks = value.replace(/<br\s*\/?>/gi, " ").replace(/<\/(div|p|li)>/gi, " ");
  const noTags = withBreaks.replace(/<\/?[a-zA-Z][^>]*>/g, "");
  const decoded = noTags.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
  return decoded.replace(/\s+/g, " ").trim();
}

function normalizeCell(value: string, doStrip: boolean): string {
  // Undo the spreadsheet-injection guard added by the CSV/TSV export (leading ' before = + - @ tab CR).
  const unguarded = /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
  const text = doStrip ? stripHtml(unguarded) : unguarded;
  return text.replace(/\s+/g, " ").trim();
}

function resolveSeparator(text: string, options: ParseOptions): string {
  switch (options.separator) {
    case "tab":
      return "\t";
    case "comma":
      return ",";
    case "semicolon":
      return ";";
    case "pipe":
      return "|";
    case "custom":
      return options.customSeparator ?? "";
    default: {
      let declared: string | undefined;
      for (const line of text.replace(/^\uFEFF/, "").split(/\r?\n/)) {
        if (line.trim() === "") continue;
        if (!ANKI_HEADER.test(line)) break;
        const m = /^#separator\s*:\s*(\w+)/i.exec(line);
        if (m) declared = m[1].toLowerCase();
      }
      if (declared === "tab") return "\t";
      if (declared === "comma") return ",";
      if (declared === "semicolon") return ";";
      if (declared === "pipe") return "|";
      const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "" && !ANKI_HEADER.test(l)) ?? "";
      return firstLine.includes("\t") ? "\t" : ",";
    }
  }
}

/**
 * Returns the index of the closing quote for a quoted field opening at `start`, or -1 when no valid closing
 * quote exists. A closing quote must be followed by a separator, a line break or the end of the text, so
 * fields such as `"To be" - who?` or an unbalanced `"` stay literal and never swallow later rows.
 */
function findClosingQuote(input: string, start: number, separator: string): number {
  let j = start + 1;
  while (j < input.length) {
    if (input[j] === '"') {
      if (input[j + 1] === '"') {
        j += 2;
        continue;
      }
      const after = j + 1;
      const ok =
        after >= input.length ||
        input[after] === "\r" ||
        input[after] === "\n" ||
        (separator.length > 0 && input.startsWith(separator, after));
      return ok ? j : -1;
    }
    j++;
  }
  return -1;
}

/** Splits text into records of fields; honours quotes (with "" escapes and embedded newlines) when enabled. */
export function splitRecords(text: string, separator: string, quotes: boolean): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let fieldStart = true;
  let skipLine = false;
  let seenData = false;
  const input = text.replace(/^\uFEFF/, "");
  const sepLen = separator.length;

  const endField = () => {
    record.push(field);
    field = "";
    fieldStart = true;
  };
  const endRecord = () => {
    endField();
    if (!skipLine) {
      records.push(record);
      if (!(record.length === 1 && record[0].trim() === "")) seenData = true;
    }
    record = [];
    skipLine = false;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (
      !seenData &&
      fieldStart &&
      record.length === 0 &&
      field === "" &&
      ch === "#" &&
      ANKI_HEADER.test(input.slice(i, i + 40))
    ) {
      // Anki header line (#separator:tab, #html:true ...) before the first data row: ignore the line.
      skipLine = true;
    }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      endRecord();
      continue;
    }
    if (!skipLine && sepLen > 0 && input.startsWith(separator, i)) {
      endField();
      i += sepLen - 1;
      continue;
    }
    if (!skipLine && quotes && ch === '"' && fieldStart) {
      const end = findClosingQuote(input, i, separator);
      if (end >= 0) {
        field += input.slice(i + 1, end).replace(/""/g, '"');
        fieldStart = false;
        i = end;
        continue;
      }
    }
    fieldStart = false;
    field += ch;
  }
  if (field !== "" || record.length > 0) endRecord();
  return records;
}

export function parseTermPairs(text: string, options: ParseOptions = DEFAULT_PARSE_OPTIONS): ParseResult {
  const separator = resolveSeparator(text, options);
  const pairs: TermPair[] = [];
  const skipped: SkippedRow[] = [];
  if (separator === "") {
    return { pairs, skipped, separatorUsed: separator };
  }
  const records = splitRecords(text, separator, options.quotes);
  let row = 0;
  for (const record of records) {
    if (record.length === 1 && record[0].trim() === "") continue; // blank line
    row++;
    const cells = record.map((c) => normalizeCell(c, options.stripHtml));
    if (row === 1 && cells[0].toLowerCase() === HEADER_FIRST && cells[1]?.toLowerCase() === HEADER_SECOND) {
      row--;
      continue; // header written by our own CSV/TSV export
    }
    if (cells.length < 2 || cells[0] === "" || cells[1] === "") {
      skipped.push({ row, reason: "Needs both a term and a definition." });
      continue;
    }
    pairs.push({ term: cells[0], definition: cells[1], row });
  }
  return { pairs, skipped, separatorUsed: separator };
}

const key = (value: string): string => value.trim().toLowerCase();

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministically picks up to `count` entries from `candidates` (seeded; same input gives same output). */
export function pickDeterministic(candidates: readonly string[], count: number, seed: string): string[] {
  const pool = [...candidates];
  const random = mulberry32(fnv1a(seed));
  const result: string[] = [];
  while (result.length < count && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    result.push(pool[index]);
    pool.splice(index, 1);
  }
  return result;
}

export function applyTemplate(template: string, term: string): string {
  const t = template.trim();
  if (t === "") return term;
  return t.includes("{term}") ? t.split("{term}").join(term) : `${t} ${term}`;
}

export function buildImportItems(pairs: readonly TermPair[], options: BuildOptions): BuildResult {
  const skipped: SkippedRow[] = [];
  const usable: { question: string; answer: string; row: number }[] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  for (const pair of pairs) {
    const prompt = options.direction === "term-to-definition" ? pair.term : pair.definition;
    const answer = options.direction === "term-to-definition" ? pair.definition : pair.term;
    const question = applyTemplate(options.template, prompt);
    if (question.length > MAX_QUESTION_LENGTH) {
      skipped.push({ row: pair.row, reason: `Question is longer than ${MAX_QUESTION_LENGTH} characters.` });
      continue;
    }
    if (answer.length > MAX_ANSWER_LENGTH) {
      skipped.push({ row: pair.row, reason: `Answer is longer than ${MAX_ANSWER_LENGTH} characters.` });
      continue;
    }
    const dedupeKey = `${key(question)}\u0000${key(answer)}`;
    if (seen.has(dedupeKey)) {
      duplicates++;
      continue;
    }
    seen.add(dedupeKey);
    usable.push({ question, answer, row: pair.row });
  }

  if (usable.length < MIN_USABLE_ROWS) {
    return {
      items: [],
      skipped,
      duplicates,
      truncated: 0,
      error: `At least ${MIN_USABLE_ROWS} usable rows are needed to build wrong answers from the same set.`,
    };
  }

  const items: ImportItem[] = [];
  usable.forEach((entry, index) => {
    const questionKey = key(entry.question);
    const blocked = new Set<string>([key(entry.answer)]);
    // Another row with the same question has its own correct answer; never offer it as a wrong one.
    for (const other of usable) {
      if (key(other.question) === questionKey) blocked.add(key(other.answer));
    }
    const seenCandidates = new Set<string>();
    const candidates: string[] = [];
    for (const other of usable) {
      const k = key(other.answer);
      if (blocked.has(k) || seenCandidates.has(k)) continue;
      seenCandidates.add(k);
      candidates.push(other.answer);
    }
    const incorrectAnswers = pickDeterministic(candidates, MAX_DISTRACTORS, `${index}|${entry.question}`);
    if (incorrectAnswers.length === 0) {
      skipped.push({ row: entry.row, reason: "No other distinct answer is available to use as a wrong answer." });
      return;
    }
    items.push({ question: entry.question, correctAnswer: entry.answer, incorrectAnswers, explanation: "" });
  });

  const limit = Math.max(0, options.limit);
  const truncated = Math.max(0, items.length - limit);
  return {
    items: items.slice(0, limit),
    skipped,
    duplicates,
    truncated,
    error: items.length === 0 ? "No row could be turned into a question with wrong answers." : null,
  };
}
