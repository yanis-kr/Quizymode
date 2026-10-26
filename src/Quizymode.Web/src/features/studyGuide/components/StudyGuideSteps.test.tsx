import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StudyGuideSteps } from "./StudyGuideSteps";

describe("StudyGuideSteps", () => {
  it("renders the three steps in an ordered list", () => {
    render(<StudyGuideSteps current="add" />);

    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["1Add material", "2Choose coverage", "3Review"]);
    expect(screen.getByRole("list").tagName).toBe("OL");
  });

  it.each([
    ["add", "Add material"],
    ["coverage", "Choose coverage"],
    ["review", "Review"],
  ] as const)("marks only %s as the current step", (current, label) => {
    render(<StudyGuideSteps current={current} />);

    const marked = screen.getAllByRole("listitem").filter((item) => item.getAttribute("aria-current") === "step");
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveTextContent(label);
  });
});
