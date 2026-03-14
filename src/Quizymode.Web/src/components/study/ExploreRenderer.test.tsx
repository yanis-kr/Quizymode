import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExploreRenderer } from "./ExploreRenderer";

const mockItem = {
  id: "item-1",
  category: "Math",
  isPrivate: false,
  question: "What is 2 + 2?",
  correctAnswer: "4",
  incorrectAnswers: ["3", "5", "6"],
  explanation: "Basic addition.",
  createdAt: "2024-01-01T00:00:00Z",
  keywords: [],
  collections: [],
};

describe("ExploreRenderer", () => {
  it("renders question and correct answer", () => {
    render(<ExploreRenderer item={mockItem} />);
    expect(screen.getByText("Question")).toBeInTheDocument();
    expect(screen.getByText("What is 2 + 2?")).toBeInTheDocument();
    expect(screen.getByText("Answer")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("renders explanation when present", () => {
    render(<ExploreRenderer item={mockItem} />);
    expect(screen.getByText("Explanation")).toBeInTheDocument();
    expect(screen.getByText("Basic addition.")).toBeInTheDocument();
  });

  it("does not render explanation section when explanation is empty", () => {
    const itemNoExplanation = { ...mockItem, explanation: "" };
    render(<ExploreRenderer item={itemNoExplanation} />);
    expect(screen.queryByText("Explanation")).not.toBeInTheDocument();
  });

  it("renders category and source in metadata", () => {
    render(<ExploreRenderer item={{ ...mockItem, source: "Textbook" }} />);
    expect(screen.getByText(/Category: Math/)).toBeInTheDocument();
    expect(screen.getByText(/Source: Textbook/)).toBeInTheDocument();
  });
});
