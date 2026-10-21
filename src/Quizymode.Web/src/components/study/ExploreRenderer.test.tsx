import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("shows the question face-up; answer and explanation are hidden until flipped", () => {
    render(<ExploreRenderer item={mockItem} />);
    expect(screen.getByTestId("flashcard-front")).not.toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("flashcard-back")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("What is 2 + 2?")).toBeInTheDocument();
  });

  it("flips to show answer and explanation when the card is clicked", async () => {
    const user = userEvent.setup();
    render(<ExploreRenderer item={mockItem} />);
    await user.click(screen.getByRole("button", { name: /show answer and explanation/i }));
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Explanation")).toBeInTheDocument();
    expect(screen.getByText("Basic addition.")).toBeInTheDocument();
  });

  it("does not render explanation on the back when explanation is empty", async () => {
    const user = userEvent.setup();
    const itemNoExplanation = { ...mockItem, explanation: "" };
    render(<ExploreRenderer item={itemNoExplanation} />);
    await user.click(screen.getByRole("button", { name: /show answer and explanation/i }));
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByText("Explanation")).not.toBeInTheDocument();
  });

  it("resets to question face-up when the item changes", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ExploreRenderer item={mockItem} />);
    await user.click(screen.getByRole("button", { name: /show answer and explanation/i }));
    expect(screen.getByText("4")).toBeInTheDocument();

    rerender(
      <ExploreRenderer
        item={{
          ...mockItem,
          id: "item-2",
          question: "Next?",
          correctAnswer: "Yes",
          explanation: "Because.",
        }}
      />
    );
    expect(screen.getByTestId("flashcard-back")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Next?")).toBeInTheDocument();
  });

  describe("self-grading", () => {
    it("shows no grade group without onGrade", async () => {
      const user = userEvent.setup();
      render(<ExploreRenderer item={mockItem} />);
      await user.click(screen.getByRole("button", { name: /show answer and explanation/i }));
      expect(screen.queryByRole("group", { name: "How well did you know this?" })).toBeNull();
    });

    it("shows the group only after flipping, Got it first, outside the flip buttons", async () => {
      const user = userEvent.setup();
      render(<ExploreRenderer item={mockItem} onGrade={() => {}} />);
      expect(screen.queryByRole("group", { name: "How well did you know this?" })).toBeNull();
      await user.click(screen.getByRole("button", { name: /show answer and explanation/i }));
      const group = screen.getByRole("group", { name: "How well did you know this?" });
      const buttons = Array.from(group.querySelectorAll("button")).map((b) => b.textContent);
      expect(buttons).toEqual(["Got it", "Still learning"]);
      expect(group.closest("button")).toBeNull();
      expect(screen.getByRole("button", { name: "Got it" })).toHaveAttribute("aria-keyshortcuts", "1");
      expect(screen.getByRole("button", { name: "Still learning" })).toHaveAttribute("aria-keyshortcuts", "2");
    });

    it("marks the chosen grade pressed, grades once and ignores the already pressed grade", async () => {
      const user = userEvent.setup();
      const onGrade = vi.fn();
      const { rerender } = render(<ExploreRenderer item={mockItem} onGrade={onGrade} />);
      await user.click(screen.getByRole("button", { name: /show answer and explanation/i }));
      await user.click(screen.getByRole("button", { name: "Still learning" }));
      expect(onGrade).toHaveBeenCalledWith(mockItem, "still-learning");

      rerender(<ExploreRenderer item={mockItem} onGrade={onGrade} grade="still-learning" />);
      expect(screen.getByRole("button", { name: "Still learning" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Got it" })).toHaveAttribute("aria-pressed", "false");
      await user.click(screen.getByRole("button", { name: "Still learning" }));
      expect(onGrade).toHaveBeenCalledTimes(1);
    });
  });
});
