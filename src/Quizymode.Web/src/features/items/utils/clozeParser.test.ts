import { describe, expect, it } from "vitest";
import { CLOZE_AI_HELPER_PROMPT, parseCloze } from "./clozeParser";

const parse = (text: string, limit = 100) => parseCloze(text, { limit });

describe("parseCloze (#261)", () => {
  it("builds one card from a single deletion with distractors", () => {
    const r = parse("{{c1::Paris}} is the capital of France | Lyon | Marseille");
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]).toMatchObject({
      question: "___ is the capital of France",
      correctAnswer: "Paris",
      incorrectAnswers: ["Lyon", "Marseille"],
      explanation: "",
      sourceLine: 1,
      cardIndex: 1,
      cardPosition: 1,
      cardCount: 1,
    });
    expect(r.skipped).toEqual([]);
  });

  it("makes one card per index and targets prefixed distractors", () => {
    const r = parse("{{c1::France}}'s capital is {{c2::Paris}} | c1: Spain | c2: Rome");
    expect(r.drafts.map((d) => [d.question, d.correctAnswer, d.incorrectAnswers])).toEqual([
      ["___'s capital is Paris", "France", ["Spain"]],
      ["France's capital is ___", "Paris", ["Rome"]],
    ]);
    expect(r.drafts.map((d) => [d.cardPosition, d.cardCount])).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("applies unprefixed distractors to every card and keeps text order", () => {
    const r = parse("{{c1::A}} then {{c2::B}} | z1 | c2: z2 | z3");
    expect(r.drafts[0].incorrectAnswers).toEqual(["z1", "z3"]);
    expect(r.drafts[1].incorrectAnswers).toEqual(["z1", "z2", "z3"]);
  });

  it("groups the same index into one card with a joined answer", () => {
    const r = parse("{{c1::H}} and {{c1::O}} make water | X, Y");
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0].question).toBe("___ and ___ make water");
    expect(r.drafts[0].correctAnswer).toBe("H, O");
    expect(r.drafts[0].incorrectAnswers).toEqual(["X, Y"]);
  });

  it("renders hints only on the card they belong to", () => {
    const r = parse("{{c1::Paris::city}} and {{c2::France}} | Lyon");
    expect(r.drafts[0].question).toBe("___ (city) and France");
    expect(r.drafts[1].question).toBe("Paris and ___");
  });

  it("splits hint at the first :: after the answer", () => {
    const r = parse("{{c1::a::b::c}} is first | x");
    expect(r.drafts[0].question).toBe("___ (b::c) is first");
    expect(r.drafts[0].correctAnswer).toBe("a");
  });

  it("keeps the first four distractors and drops blanks", () => {
    const r = parse("{{c1::A}} is a letter |  | w1 | w2 | w3 | w4 | w5");
    expect(r.drafts[0].incorrectAnswers).toEqual(["w1", "w2", "w3", "w4"]);
  });

  it("skips a card with no distractors", () => {
    const r = parse("{{c1::A}} is a letter");
    expect(r.drafts).toEqual([]);
    expect(r.skipped).toEqual([{ line: 1, card: 1, reason: "needs 1-4 incorrect answers" }]);
  });

  it("skips only the card whose distractor equals its own answer", () => {
    const r = parse("{{c1::A}} and {{c2::B}} | c1: a | c2: C");
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0].cardIndex).toBe(2);
    expect(r.drafts[0]).toMatchObject({ cardPosition: 1, cardCount: 1 });
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]).toMatchObject({ line: 1, card: 1 });
  });

  it("allows an unprefixed distractor equal to a sibling's answer on the other card", () => {
    const r = parse("{{c1::A}} and {{c2::B}} | B");
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]).toMatchObject({ cardIndex: 1, incorrectAnswers: ["B"] });
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0]).toMatchObject({ card: 2 });
  });

  it("skips duplicate distractors", () => {
    const r = parse("{{c1::A}} is a letter | x | X");
    expect(r.drafts).toEqual([]);
    expect(r.skipped[0].reason).toMatch(/different from each other/);
  });

  it("treats | inside braces as text and \\| as a literal pipe", () => {
    const r = parse("{{c1::a|b}} and x\\|y | w\\|1 | w2");
    expect(r.drafts[0].correctAnswer).toBe("a|b");
    expect(r.drafts[0].question).toBe("___ and x|y");
    expect(r.drafts[0].incorrectAnswers).toEqual(["w|1", "w2"]);
  });

  it("treats a stray }} in the question as literal text", () => {
    const r = parse("a }} {{c1::b}} | x");
    expect(r.drafts[0].question).toBe("a }} ___");
  });

  it("skips malformed lines with line numbers and keeps the others", () => {
    const r = parse(
      [
        "no deletion here | x",
        "{{c1::}} empty | x",
        "{{c0::zero}} is zero | x",
        "{{c1::open is unclosed | x",
        "{{c1::outer {{c2::inner}}}} | x",
        "{{c1::A}} bad prefix | c2: x",
        "{{c1::A}} bad distractor | {{c1::x}}",
        "{{c1::Ok}} stays | fine",
      ].join("\n")
    );
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0].sourceLine).toBe(8);
    expect(r.skipped.map((s) => s.line)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(r.skipped.every((s) => s.card === undefined)).toBe(true);
  });

  it("skips a card whose question has no text besides the blank", () => {
    const r = parse("{{c1::Paris::city}} | x");
    expect(r.drafts).toEqual([]);
    expect(r.skipped).toEqual([
      { line: 1, card: 1, reason: "question has no text besides the blank" },
    ]);
  });

  it("enforces length limits per card without truncating", () => {
    const longHint = "h".repeat(1000);
    const a = parse(`{{c1::A::${longHint}}} text | x`);
    expect(a.drafts).toEqual([]);
    expect(a.skipped[0].reason).toMatch(/question is longer than 1000/);

    const joined = parse(`{{c1::${"a".repeat(300)}}} and {{c1::${"b".repeat(300)}}} text | x`);
    expect(joined.drafts).toEqual([]);
    expect(joined.skipped[0].reason).toMatch(/answer is longer than 500/);

    const wrong = parse(`{{c1::A}} text | ${"w".repeat(501)}`);
    expect(wrong.drafts).toEqual([]);
    expect(wrong.skipped[0].reason).toMatch(/wrong answer is longer than 500/);
  });

  it("dedupes identical generated questions case-insensitively", () => {
    const r = parse("{{c1::A}} is it | x\n{{c1::A}} IS it | y");
    expect(r.drafts).toHaveLength(1);
    expect(r.duplicates).toBe(1);
  });

  it("truncates at the limit and reports it", () => {
    const text = [1, 2, 3].map((n) => `{{c1::A}} item ${n} | x`).join("\n");
    const r = parse(text, 2);
    expect(r.drafts).toHaveLength(2);
    expect(r.truncated).toBe(true);
    expect(parse(text, 3).truncated).toBe(false);
  });

  it("numbers cards by kept position when indexes have gaps", () => {
    const r = parse("{{c1::A}} {{c3::B}} text | x");
    expect(r.drafts.map((d) => [d.cardIndex, d.cardPosition, d.cardCount])).toEqual([
      [1, 1, 2],
      [3, 2, 2],
    ]);
  });

  it("recomputes card counts after per-card skips and truncation", () => {
    const r = parse("{{c1::A}} {{c2::B}} text | c1: a | c2: z", 100);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]).toMatchObject({ cardPosition: 1, cardCount: 1 });
    const t = parse("{{c1::A}} {{c2::B}} text | x", 1);
    expect(t.drafts[0]).toMatchObject({ cardPosition: 1, cardCount: 1 });
  });

  it("handles CRLF, blank lines, and keeps source line numbers", () => {
    const r = parse("\r\n{{c1::A}} one | x\r\n\r\n   \r\n{{c1::B}} two | y\r\n");
    expect(r.drafts.map((d) => d.sourceLine)).toEqual([2, 5]);
  });

  it("never throws on odd input", () => {
    expect(parse("").drafts).toEqual([]);
    expect(parse("{{").skipped).toHaveLength(1);
    expect(parse("}}{{|||\\").drafts).toEqual([]);
    expect(parseCloze(undefined as unknown as string, { limit: 5 }).drafts).toEqual([]);
  });

  it("exports a helper prompt", () => {
    expect(CLOZE_AI_HELPER_PROMPT).toContain("{{c1::");
  });
});
