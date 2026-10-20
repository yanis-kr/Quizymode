import { describe, expect, it } from "vitest";
import { compactIncorrectAnswersWithSpeech } from "./itemSpeech";

describe("compactIncorrectAnswersWithSpeech", () => {
  it("keeps keys and trims values when no answers are blank", () => {
    const result = compactIncorrectAnswersWithSpeech(["A", "B"], {
      0: { pronunciation: " a " },
      1: { languageCode: " en-US " },
    });
    expect(result.incorrectAnswers).toEqual(["A", "B"]);
    expect(result.incorrectAnswerSpeech).toEqual({
      0: { pronunciation: "a" },
      1: { languageCode: "en-US" },
    });
  });

  it("re-indexes speech after a blank middle answer", () => {
    const result = compactIncorrectAnswersWithSpeech(["A", "", "C"], {
      2: { pronunciation: "c" },
    });
    expect(result.incorrectAnswers).toEqual(["A", "C"]);
    expect(result.incorrectAnswerSpeech).toEqual({ 1: { pronunciation: "c" } });
  });

  it("moves index 3 to 2 when the first answer is blank", () => {
    const result = compactIncorrectAnswersWithSpeech(["", "B", "C", "D"], {
      3: { pronunciation: "d" },
    });
    expect(result.incorrectAnswers).toEqual(["B", "C", "D"]);
    expect(result.incorrectAnswerSpeech).toEqual({ 2: { pronunciation: "d" } });
  });

  it("discards speech entered under a blank answer", () => {
    const result = compactIncorrectAnswersWithSpeech(["A", ""], {
      1: { pronunciation: "ghost" },
    });
    expect(result.incorrectAnswers).toEqual(["A"]);
    expect(result.incorrectAnswerSpeech).toBeUndefined();
  });

  it("treats whitespace-only answers as blank", () => {
    const result = compactIncorrectAnswersWithSpeech(["A", "   ", "C"], {
      2: { pronunciation: "c" },
    });
    expect(result.incorrectAnswers).toEqual(["A", "C"]);
    expect(result.incorrectAnswerSpeech).toEqual({ 1: { pronunciation: "c" } });
  });

  it("returns undefined when speech values are empty", () => {
    const result = compactIncorrectAnswersWithSpeech(["A"], {
      0: { pronunciation: " ", languageCode: "" },
    });
    expect(result.incorrectAnswerSpeech).toBeUndefined();
  });

  it("returns undefined for a null or undefined map", () => {
    expect(compactIncorrectAnswersWithSpeech(["A"], null).incorrectAnswerSpeech).toBeUndefined();
    expect(compactIncorrectAnswersWithSpeech(["A"]).incorrectAnswerSpeech).toBeUndefined();
  });

  it("ignores stale or invalid keys", () => {
    const result = compactIncorrectAnswersWithSpeech(["A"], {
      3: { pronunciation: "x" },
      [-1]: { pronunciation: "y" },
    });
    expect(result.incorrectAnswerSpeech).toBeUndefined();
  });

  it("returns empty answers when all are blank", () => {
    const result = compactIncorrectAnswersWithSpeech(["", " "], { 0: { pronunciation: "a" } });
    expect(result.incorrectAnswers).toEqual([]);
    expect(result.incorrectAnswerSpeech).toBeUndefined();
  });

  it("does not mutate its inputs", () => {
    const answers = ["A", "", "C"];
    const speech = { 2: { pronunciation: " c " } };
    compactIncorrectAnswersWithSpeech(answers, speech);
    expect(answers).toEqual(["A", "", "C"]);
    expect(speech).toEqual({ 2: { pronunciation: " c " } });
  });
});
