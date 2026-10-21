import { describe, expect, it } from "vitest";
import {
  DUPLICATE_INCORRECT_ANSWERS_MESSAGE,
  INCORRECT_MATCHES_CORRECT_MESSAGE,
  getIncorrectAnswerConflict,
} from "./incorrectAnswerRules";

describe("getIncorrectAnswerConflict", () => {
  it.each([
    [["paris"], INCORRECT_MATCHES_CORRECT_MESSAGE],
    [[" PARIS "], INCORRECT_MATCHES_CORRECT_MESSAGE],
    [["Lyon", "lyon"], DUPLICATE_INCORRECT_ANSWERS_MESSAGE],
    [["Lyon", " LYON ", "Nice"], DUPLICATE_INCORRECT_ANSWERS_MESSAGE],
    [["Lyon", "lyon", "paris"], INCORRECT_MATCHES_CORRECT_MESSAGE],
    [["Lyon", "Nice"], null],
    [["Lyon", "", "   ", "Nice"], null],
  ])("returns the expected message for %j", (incorrect, expected) => {
    expect(getIncorrectAnswerConflict("Paris", incorrect)).toBe(expected);
  });

  it("is not a conflict for a blank correct answer or a missing list", () => {
    expect(getIncorrectAnswerConflict("", ["Lyon"])).toBeNull();
    expect(getIncorrectAnswerConflict(null, ["Lyon"])).toBeNull();
    expect(getIncorrectAnswerConflict("Paris", null)).toBeNull();
    expect(getIncorrectAnswerConflict("Paris", undefined)).toBeNull();
  });
});
