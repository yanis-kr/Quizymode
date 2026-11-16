import { describe, expect, it } from "vitest";
import { rationaleLabel } from "./answerFeedbackLabel";

describe("rationaleLabel (#713)", () => {
  it.each(["exams", "Exams", "tech", "Tech", " exams "])("%s -> Why", (category) => {
    expect(rationaleLabel(category)).toBe("Why");
  });

  it.each(["geography", "trivia", "", "Exams Prep"])("%s -> Did you know?", (category) => {
    expect(rationaleLabel(category)).toBe("Did you know?");
  });

  it("treats a missing category as Did you know?", () => {
    expect(rationaleLabel(undefined)).toBe("Did you know?");
    expect(rationaleLabel(null)).toBe("Did you know?");
  });
});
