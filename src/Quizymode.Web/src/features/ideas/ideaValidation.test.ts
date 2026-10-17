import { describe, expect, it } from "vitest";
import {
  countMeaningfulCharacters,
  getIdeaCommentError,
  getIdeaFieldError,
} from "./ideaValidation";

describe("countMeaningfulCharacters", () => {
  it("counts only letters and digits", () => {
    expect(countMeaningfulCharacters("---")).toBe(0);
    expect(countMeaningfulCharacters(" a-b  c! ")).toBe(3);
    expect(countMeaningfulCharacters("v2.0")).toBe(3);
  });

  it("counts non-Latin letters like .NET char.IsLetterOrDigit", () => {
    expect(countMeaningfulCharacters("Ünïcødé")).toBe(7);
    expect(countMeaningfulCharacters("日本語")).toBe(3);
  });

  it("ignores characters outside the BMP, matching UTF-16 char checks", () => {
    expect(countMeaningfulCharacters("😀😀😀")).toBe(0);
  });
});

describe("getIdeaFieldError", () => {
  it("rejects punctuation-only titles that satisfy raw length", () => {
    expect(getIdeaFieldError("title", "---")).toBe(
      "Title must contain at least 3 letters or digits."
    );
    expect(getIdeaFieldError("title", "a - b")).toBe(
      "Title must contain at least 3 letters or digits."
    );
    expect(getIdeaFieldError("title", "abc")).toBeNull();
  });

  it("requires 10 meaningful characters for long-form fields", () => {
    expect(getIdeaFieldError("problem", "a b c d e f g h i")).toBe(
      "Problem must contain at least 10 letters or digits."
    );
    expect(getIdeaFieldError("proposedChange", "abcdefghij")).toBeNull();
  });

  it("keeps trade-offs optional but validates them when provided", () => {
    expect(getIdeaFieldError("tradeOffs", "   ")).toBeNull();
    expect(getIdeaFieldError("tradeOffs", "..........!")).toBe(
      "Trade-offs must contain at least 10 letters or digits when provided."
    );
  });

  it("reports required and max-length errors", () => {
    expect(getIdeaFieldError("title", "  ")).toBe("Title is required.");
    expect(getIdeaFieldError("title", "a".repeat(201))).toBe("Title is too long (201/200).");
  });
});

describe("getIdeaCommentError", () => {
  it("requires at least 3 meaningful characters", () => {
    expect(getIdeaCommentError("")).toBe("Comment is required.");
    expect(getIdeaCommentError("ok")).toBe("Comment must contain at least 3 letters or digits.");
    expect(getIdeaCommentError("!!!")).toBe("Comment must contain at least 3 letters or digits.");
    expect(getIdeaCommentError("yes")).toBeNull();
  });

  it("enforces the 2000 character maximum", () => {
    expect(getIdeaCommentError("a".repeat(2001))).toBe("Comment is too long (2001/2000).");
    expect(getIdeaCommentError("a".repeat(2000))).toBeNull();
  });
});
