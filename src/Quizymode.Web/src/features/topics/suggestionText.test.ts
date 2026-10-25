import { describe, expect, it } from "vitest";
import {
  composeImportSuggestionText,
  composeItemSuggestionText,
  composeJsonSuggestionText,
  composeNotesSuggestionText,
  isReadableTextFile,
} from "./suggestionText";

describe("suggestion text composition", () => {
  it("joins the question, answer and explanation, skipping blanks, capped at 5,000 characters", () => {
    expect(composeItemSuggestionText(" Q? ", "A", "")).toBe("Q?\nA");
    expect(composeItemSuggestionText("x".repeat(6000), "A", "E")).toHaveLength(5000);
  });

  it("uses the title and pasted text for notes in paste mode", () => {
    expect(
      composeNotesSuggestionText({ mode: "text", title: "Plants", pastedText: "Photosynthesis", fileName: null, fileSample: "" })
    ).toBe("Plants\nPhotosynthesis");
  });

  it("uses the sampled content for .txt and .md files", () => {
    for (const fileName of ["notes.txt", "NOTES.MD"]) {
      expect(isReadableTextFile(fileName)).toBe(true);
      expect(
        composeNotesSuggestionText({ mode: "file", title: "", pastedText: "ignored", fileName, fileSample: "cell biology" })
      ).toBe("cell biology");
    }
  });

  it("uses the title and the file name stem for pdf, docx and pptx", () => {
    for (const fileName of ["plant-biology_ch3.pdf", "plant-biology_ch3.docx", "plant-biology_ch3.pptx"]) {
      expect(isReadableTextFile(fileName)).toBe(false);
      expect(
        composeNotesSuggestionText({ mode: "file", title: "Bio", pastedText: "", fileName, fileSample: "" })
      ).toBe("Bio\nplant biology ch3");
    }
  });

  it("uses only the title before a file is chosen", () => {
    expect(
      composeNotesSuggestionText({ mode: "file", title: "Bio", pastedText: "", fileName: null, fileSample: "" })
    ).toBe("Bio");
  });

  it("uses the question and answer of the first 20 rows for imports", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ question: `Q${i}`, correctAnswer: `A${i}` }));
    const text = composeImportSuggestionText(rows);
    expect(text.split("\n")).toHaveLength(20);
    expect(text).toContain("Q19 A19");
    expect(text).not.toContain("Q20");
  });

  it("reads rows from a pasted JSON array and ignores unparseable JSON", () => {
    expect(composeJsonSuggestionText(JSON.stringify([{ question: "Q", correctAnswer: "A" }, 3, null]))).toBe("Q A");
    expect(composeJsonSuggestionText("{not json")).toBe("");
    expect(composeJsonSuggestionText(JSON.stringify({ question: "Q" }))).toBe("");
    expect(composeJsonSuggestionText("  ")).toBe("");
  });
});
