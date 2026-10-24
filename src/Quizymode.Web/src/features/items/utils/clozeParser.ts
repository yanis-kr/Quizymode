/**
 * Cloze paste parser for Bulk Create (#261). Pure and never throws.
 *
 * Format: one note per non-empty line.
 *   {{c1::answer}} / {{c1::answer::hint}}   cloze deletion (N >= 1)
 *   text | wrong | wrong                     distractors after the first unescaped "|" outside braces
 *   | c1: wrong                              prefixed distractor applies to card N only
 *   \|                                       literal pipe
 */
import { getIncorrectAnswerConflict } from "@/utils/incorrectAnswerRules";

export interface ClozeDraft {
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  explanation: string;
  /** 1-based line number in the pasted text. */
  sourceLine: number;
  /** The cN number this card was built from. */
  cardIndex: number;
  /** 1-based position among cards kept from the same line, ordered by cN. */
  cardPosition: number;
  /** Number of cards kept from the same line. */
  cardCount: number;
}

export interface ClozeSkipped {
  line: number;
  /** cN number when only one card of the line was skipped. */
  card?: number;
  reason: string;
}

export interface ClozeParseResult {
  drafts: ClozeDraft[];
  skipped: ClozeSkipped[];
  duplicates: number;
  truncated: boolean;
}

export const CLOZE_MAX_QUESTION_LENGTH = 1000;
export const CLOZE_MAX_ANSWER_LENGTH = 500;
const MAX_INCORRECT = 4;
const BLANK = "___";
const PREFIX_REGEX = /^c(\d+):\s*/i;
const MARKER_REGEX = /^c(\d+)::([\s\S]*)$/i;

export const CLOZE_AI_HELPER_PROMPT = `Write study notes in cloze format for a quiz app. Output plain text only: one note per line, no numbering, no Markdown, no code fences.

Format rules:
- Wrap each answer in {{c1::answer}}. Use {{c2::...}}, {{c3::...}} for other answers on the same line; each number becomes a separate card, and the same number blanks out together.
- Optional hint: {{c1::answer::hint}}.
- After the sentence, add 1-4 wrong answers separated by | (a pipe). They must be plausible, different from each other, and different from the correct answer.
- With several numbers on one line, prefix a wrong answer to target one card: | c1: wrong for card 1 | c2: wrong for card 2. Wrong answers without a prefix apply to every card on the line.
- To write a literal pipe inside text, use \\|.
- Keep each line under 1000 characters and each answer under 500 characters. Plain text only.

Examples:
{{c1::Paris}} is the capital of France | Lyon | Marseille
{{c1::France}}'s capital is {{c2::Paris}} | c1: Spain | c2: Rome

Write 10 to 15 notes about the topic I give you.`;

type Piece =
  | { kind: "text"; value: string }
  | { kind: "blank"; index: number; answer: string; hint: string };

interface LineParse {
  pieces: Piece[];
  segments: string[];
}

class MalformedLine extends Error {}

const unescapePipe = (s: string): string => s.replace(/\\\|/g, "|");

function splitLine(line: string): LineParse {
  const pieces: Piece[] = [];
  const segments: string[] = [];
  let segment = 0; // 0 = question, >0 = distractor segments
  let buf = "";
  const flush = () => {
    if (segment === 0) {
      if (buf) pieces.push({ kind: "text", value: buf });
    } else {
      segments.push(buf);
    }
    buf = "";
  };
  let i = 0;
  while (i < line.length) {
    if (line.startsWith("\\|", i)) {
      buf += "|";
      i += 2;
      continue;
    }
    if (line.startsWith("{{", i)) {
      if (segment > 0) throw new MalformedLine("braces are not allowed in wrong answers");
      const end = line.indexOf("}}", i + 2);
      if (end === -1) throw new MalformedLine("unclosed {{");
      const inner = line.slice(i + 2, end);
      if (inner.includes("{{")) throw new MalformedLine("nested {{ is not supported");
      const match = MARKER_REGEX.exec(unescapePipe(inner));
      if (!match) throw new MalformedLine("invalid cloze marker (use {{c1::answer}})");
      const index = parseInt(match[1], 10);
      if (index < 1) throw new MalformedLine("c0 is not allowed (numbers start at c1)");
      const rest = match[2];
      const sep = rest.indexOf("::");
      const answer = (sep === -1 ? rest : rest.slice(0, sep)).trim();
      const hint = sep === -1 ? "" : rest.slice(sep + 2).trim();
      if (!answer) throw new MalformedLine("empty answer");
      flush();
      pieces.push({ kind: "blank", index, answer, hint });
      i = end + 2;
      continue;
    }
    if (line.startsWith("}}", i) && segment > 0) {
      throw new MalformedLine("braces are not allowed in wrong answers");
    }
    if (line[i] === "|") {
      flush();
      segment += 1;
      i += 1;
      continue;
    }
    buf += line[i];
    i += 1;
  }
  flush();
  return { pieces, segments };
}

interface Candidate {
  line: number;
  cardIndex: number;
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
}

function buildCards(
  lineNumber: number,
  parsed: LineParse,
  skipped: ClozeSkipped[]
): Candidate[] {
  const blanks = parsed.pieces.filter(
    (p): p is Extract<Piece, { kind: "blank" }> => p.kind === "blank"
  );
  if (blanks.length === 0) {
    skipped.push({ line: lineNumber, reason: "no {{c1::...}} deletion found" });
    return [];
  }
  const indexes = Array.from(new Set(blanks.map((b) => b.index))).sort((a, b) => a - b);

  const ordered: { index: number | null; value: string }[] = [];
  for (const raw of parsed.segments) {
    const trimmed = raw.trim();
    const prefix = PREFIX_REGEX.exec(trimmed);
    if (prefix) {
      const index = parseInt(prefix[1], 10);
      if (!indexes.includes(index)) {
        skipped.push({ line: lineNumber, reason: `wrong answer prefixed c${index}: but the line has no c${index} card` });
        return [];
      }
      const value = trimmed.slice(prefix[0].length).trim();
      ordered.push({ index, value });
    } else {
      ordered.push({ index: null, value: trimmed });
    }
  }

  const cards: Candidate[] = [];
  for (const index of indexes) {
    const fail = (reason: string) => skipped.push({ line: lineNumber, card: index, reason });
    let question = "";
    let plainText = "";
    const answers: string[] = [];
    for (const piece of parsed.pieces) {
      if (piece.kind === "text") {
        question += piece.value;
        plainText += piece.value;
      } else if (piece.index === index) {
        question += piece.hint ? `${BLANK} (${piece.hint})` : BLANK;
        answers.push(piece.answer);
      } else {
        question += piece.answer;
        plainText += piece.answer;
      }
    }
    question = question.trim();
    if (plainText.trim().length === 0) {
      fail("question has no text besides the blank");
      continue;
    }
    const correctAnswer = answers.join(", ");
    const incorrectAnswers = ordered
      .filter((o) => o.index === null || o.index === index)
      .map((o) => o.value)
      .filter((v) => v.length > 0)
      .slice(0, MAX_INCORRECT);
    if (incorrectAnswers.length === 0) {
      fail("needs 1-4 incorrect answers");
      continue;
    }
    const conflict = getIncorrectAnswerConflict(correctAnswer, incorrectAnswers);
    if (conflict) {
      fail(conflict);
      continue;
    }
    if (question.length > CLOZE_MAX_QUESTION_LENGTH) {
      fail(`question is longer than ${CLOZE_MAX_QUESTION_LENGTH} characters`);
      continue;
    }
    if (correctAnswer.length > CLOZE_MAX_ANSWER_LENGTH) {
      fail(`answer is longer than ${CLOZE_MAX_ANSWER_LENGTH} characters`);
      continue;
    }
    if (incorrectAnswers.some((a) => a.length > CLOZE_MAX_ANSWER_LENGTH)) {
      fail(`a wrong answer is longer than ${CLOZE_MAX_ANSWER_LENGTH} characters`);
      continue;
    }
    cards.push({ line: lineNumber, cardIndex: index, question, correctAnswer, incorrectAnswers });
  }
  return cards;
}

export function parseCloze(text: string, options: { limit: number }): ClozeParseResult {
  const skipped: ClozeSkipped[] = [];
  const candidates: Candidate[] = [];
  let duplicates = 0;
  let truncated = false;
  try {
    const lines = (text ?? "").split(/\r\n|\r|\n/);
    const seen = new Set<string>();
    lines.forEach((rawLine, i) => {
      if (rawLine.trim().length === 0) return;
      const lineNumber = i + 1;
      try {
        const cards = buildCards(lineNumber, splitLine(rawLine), skipped);
        for (const card of cards) {
          const key = card.question.trim().toLowerCase();
          if (seen.has(key)) {
            duplicates += 1;
            continue;
          }
          seen.add(key);
          candidates.push(card);
        }
      } catch (e) {
        skipped.push({
          line: lineNumber,
          reason: e instanceof MalformedLine ? e.message : "could not be read",
        });
      }
    });
  } catch {
    return { drafts: [], skipped, duplicates, truncated };
  }

  const limit = Math.max(0, options.limit);
  let kept = candidates;
  if (candidates.length > limit) {
    kept = candidates.slice(0, limit);
    truncated = true;
  }
  const countByLine = new Map<number, number>();
  for (const c of kept) countByLine.set(c.line, (countByLine.get(c.line) ?? 0) + 1);
  const positionByLine = new Map<number, number>();
  const drafts: ClozeDraft[] = kept.map((c) => {
    const position = (positionByLine.get(c.line) ?? 0) + 1;
    positionByLine.set(c.line, position);
    return {
      question: c.question,
      correctAnswer: c.correctAnswer,
      incorrectAnswers: c.incorrectAnswers,
      explanation: "",
      sourceLine: c.line,
      cardIndex: c.cardIndex,
      cardPosition: position,
      cardCount: countByLine.get(c.line) ?? 1,
    };
  });
  return { drafts, skipped, duplicates, truncated };
}
