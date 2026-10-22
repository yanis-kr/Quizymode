import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  downloadTextFile,
  exportFileName,
  toCsv,
  toQuizletText,
  toTsv,
  type ExportableItem,
} from "./exportFormats";
import { DEFAULT_PARSE_OPTIONS, parseTermPairs } from "./importParser";

const items: ExportableItem[] = [
  { question: "Capital of France?", correctAnswer: "Paris", incorrectAnswers: ["Rome", "Madrid"], explanation: "It is." },
  { question: 'Say "hi", please', correctAnswer: "line1\nline2", incorrectAnswers: ["a|b"], explanation: null },
  { question: "tab\there", correctAnswer: "x, y", incorrectAnswers: ["z"], explanation: "" },
];

describe("exportFormats", () => {
  it("writes CSV with header, ' | ' joined incorrect answers and proper quoting", () => {
    const csv = toCsv(items);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("question,correct answer,incorrect answers,explanation");
    expect(lines[1]).toBe("Capital of France?,Paris,Rome | Madrid,It is.");
    expect(csv).toContain('"Say ""hi"", please"');
    expect(csv).toContain('"x, y"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("writes TSV quoting only fields containing tabs, quotes or newlines", () => {
    const tsv = toTsv(items);
    expect(tsv.split("\r\n")[1]).toBe("Capital of France?\tParis\tRome | Madrid\tIt is.");
    expect(tsv).toContain('"tab\there"');
    expect(tsv).toContain('"Say ""hi"", please"');
  });

  it("writes Quizlet text as term TAB definition with no header and flattened whitespace", () => {
    const text = toQuizletText(items);
    expect(text.split("\n")).toEqual([
      "Capital of France?\tParis",
      'Say "hi", please\tline1 line2',
      "tab here\tx, y",
      "",
    ]);
  });

  it("round-trips through the import parser (CSV, TSV, Quizlet text)", () => {
    const expected = items.map((i) => [i.question.replace(/\s+/g, " "), i.correctAnswer.replace(/\s+/g, " ")]);
    for (const text of [toCsv(items), toTsv(items), toQuizletText(items)]) {
      const result = parseTermPairs(text, DEFAULT_PARSE_OPTIONS);
      expect(result.pairs.map((p) => [p.term, p.definition])).toEqual(expected);
    }
  });

  it("guards formula-like cells in CSV/TSV only and round-trips them", () => {
    const risky: ExportableItem[] = [
      { question: "=1+1", correctAnswer: "-5", incorrectAnswers: ["+x", "@y"], explanation: "" },
      { question: "#Note: hi", correctAnswer: '"To be" - who?', incorrectAnswers: ["z"], explanation: "" },
    ];
    const csv = toCsv(risky);
    expect(csv).toContain("'=1+1,'-5,'+x | @y");
    expect(toTsv(risky)).toContain("'=1+1\t'-5");
    expect(toQuizletText(risky)).toContain("=1+1\t-5");
    for (const text of [toCsv(risky), toTsv(risky), toQuizletText(risky)]) {
      const pairs = parseTermPairs(text, DEFAULT_PARSE_OPTIONS).pairs.map((p) => [p.term, p.definition]);
      expect(pairs).toEqual([
        ["=1+1", "-5"],
        ["#Note: hi", '"To be" - who?'],
      ]);
    }
  });

  it("builds safe file names", () => {
    expect(exportFileName("My Bio: Chapter 5!", "csv")).toBe("my-bio-chapter-5.csv");
    expect(exportFileName("???", "tsv")).toBe("collection.tsv");
    expect(exportFileName(undefined, "txt")).toBe("collection.txt");
  });
});

describe("downloadTextFile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates a blob, clicks a download link and revokes the URL", async () => {
    const create = vi.fn(() => "blob:test");
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadTextFile("a.csv", "x", "text/csv", true);
    expect(click).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:test"));
    const blob = (create.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe("text/csv;charset=utf-8");
    expect(blob.size).toBeGreaterThan(1);
  });
});
