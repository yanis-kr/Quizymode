import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCUMENT_LIMITS,
  formatBytes,
  validateCandidateEdit,
  validateStudyGuideDocumentForm,
  type StudyGuideDocumentForm,
} from "./studyGuideDocumentSchema";

const baseForm: StudyGuideDocumentForm = {
  mode: "text",
  file: null,
  text: "Cells are the basic unit of life.",
  title: "",
  category: "science",
  navigationKeyword1: "biology",
  navigationKeyword2: "cells",
  keywords: [],
};

describe("validateStudyGuideDocumentForm", () => {
  it("accepts valid pasted text", () => {
    expect(validateStudyGuideDocumentForm(baseForm)).toBeNull();
  });

  it("requires text in paste mode and a file in file mode", () => {
    expect(validateStudyGuideDocumentForm({ ...baseForm, text: "   " })).toMatch(/paste your study guide text/i);
    expect(validateStudyGuideDocumentForm({ ...baseForm, mode: "file" })).toMatch(/choose a file/i);
  });

  it("checks extension, empty files and the size limit", () => {
    const limits = { ...DEFAULT_DOCUMENT_LIMITS, maxFileBytes: 10 };
    const png = new File(["x"], "image.PNG");
    expect(validateStudyGuideDocumentForm({ ...baseForm, mode: "file", file: png }, limits)).toMatch(/unsupported/i);
    const empty = new File([], "notes.txt");
    expect(validateStudyGuideDocumentForm({ ...baseForm, mode: "file", file: empty }, limits)).toMatch(/empty/i);
    const big = new File(["01234567890"], "Notes.PDF");
    expect(validateStudyGuideDocumentForm({ ...baseForm, mode: "file", file: big }, limits)).toMatch(/too large/i);
    const ok = new File(["0123"], "deck.pptx");
    expect(validateStudyGuideDocumentForm({ ...baseForm, mode: "file", file: ok }, limits)).toBeNull();
  });

  it("enforces the text byte limit", () => {
    const limits = { ...DEFAULT_DOCUMENT_LIMITS, maxTextBytes: 4 };
    expect(validateStudyGuideDocumentForm({ ...baseForm, text: "héllo" }, limits)).toMatch(/or less/i);
  });

  it("validates topic, title and keywords", () => {
    expect(validateStudyGuideDocumentForm({ ...baseForm, navigationKeyword2: "" })).toMatch(/subtopic/i);
    expect(validateStudyGuideDocumentForm({ ...baseForm, title: "x".repeat(201) })).toMatch(/title/i);
    expect(validateStudyGuideDocumentForm({ ...baseForm, keywords: ["bad keyword"] })).toMatch(/letters, numbers/i);
  });
});

describe("validateCandidateEdit", () => {
  const edit = { question: "Q?", correctAnswer: "A", incorrectAnswers: ["B"], explanation: "" };

  it("accepts a valid edit", () => {
    expect(validateCandidateEdit(edit)).toBeNull();
  });

  it("rejects missing answers and too many wrong answers", () => {
    expect(validateCandidateEdit({ ...edit, question: " " })).toMatch(/question is required/i);
    expect(validateCandidateEdit({ ...edit, incorrectAnswers: [] })).toMatch(/at least one wrong answer/i);
    expect(validateCandidateEdit({ ...edit, incorrectAnswers: ["1", "2", "3", "4", "5"] })).toMatch(/at most four/i);
    expect(validateCandidateEdit({ ...edit, incorrectAnswers: [""] })).toMatch(/cannot be empty/i);
  });

  it("rejects wrong answers equal to the correct answer or to each other (#276)", () => {
    expect(validateCandidateEdit({ ...edit, incorrectAnswers: [" a "] })).toBe(
      "Wrong answers must be different from the correct answer."
    );
    expect(validateCandidateEdit({ ...edit, incorrectAnswers: ["B", "b"] })).toBe(
      "Wrong answers must be different from each other."
    );
  });
});

describe("formatBytes", () => {
  it("formats bytes, kilobytes and megabytes", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(8192)).toBe("8 KB");
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
  });
});
