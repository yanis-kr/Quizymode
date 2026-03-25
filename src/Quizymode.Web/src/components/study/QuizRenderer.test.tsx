import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuizRenderer } from "./QuizRenderer";

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

describe("QuizRenderer", () => {
  it("renders question and options", () => {
    const onAnswerSelect = vi.fn();
    render(
      <QuizRenderer
        item={mockItem}
        options={["3", "4", "5", "6"]}
        selectedAnswer={null}
        showAnswer={false}
        onAnswerSelect={onAnswerSelect}
        stats={{ total: 0, correct: 0 }}
      />
    );
    expect(screen.getByText("What is 2 + 2?")).toBeInTheDocument();
    expect(screen.getByText(/Select an answer/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /4/ })).toBeInTheDocument();
  });

  it("calls onAnswerSelect when an option is clicked", async () => {
    const user = userEvent.setup({ delay: null });
    const onAnswerSelect = vi.fn();
    render(
      <QuizRenderer
        item={mockItem}
        options={["3", "4", "5", "6"]}
        selectedAnswer={null}
        showAnswer={false}
        onAnswerSelect={onAnswerSelect}
        stats={{ total: 0, correct: 0 }}
      />
    );
    await user.click(screen.getByRole("button", { name: /4/ }));
    expect(onAnswerSelect).toHaveBeenCalledWith("4");
  });

  it("renders correct answer and explanation when showAnswer is true", () => {
    render(
      <QuizRenderer
        item={mockItem}
        options={["3", "4", "5", "6"]}
        selectedAnswer="4"
        showAnswer={true}
        onAnswerSelect={() => {}}
        stats={{ total: 1, correct: 1 }}
      />
    );
    expect(screen.getByText(/Correct Answer: 4/)).toBeInTheDocument();
    expect(screen.getByText("Basic addition.")).toBeInTheDocument();
  });

  it("renders score", () => {
    render(
      <QuizRenderer
        item={mockItem}
        options={["3", "4"]}
        selectedAnswer={null}
        showAnswer={false}
        onAnswerSelect={() => {}}
        stats={{ total: 5, correct: 3 }}
      />
    );
    expect(screen.getByText(/Score: 3 \/ 5 correct/)).toBeInTheDocument();
  });
});
