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

  it("pulses the correct option and shakes a wrong pick with motion-safe classes and hidden icons", () => {
    render(
      <QuizRenderer
        item={mockItem}
        options={["3", "4", "5", "6"]}
        selectedAnswer="3"
        showAnswer
        onAnswerSelect={vi.fn()}
        stats={{ total: 1, correct: 0 }}
      />
    );
    const correct = screen.getByRole("button", { name: /^B\. 4$/ });
    const wrong = screen.getByRole("button", { name: /^A\. 3$/ });
    expect(correct.className).toContain("motion-safe:animate-correct-pulse");
    expect(wrong.className).toContain("motion-safe:animate-wrong-shake");
    expect(correct.className).not.toMatch(/(^|\s)animate-/);
    expect(correct.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(wrong.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: /^C\. 5$/ }).querySelector("svg")).toBeNull();
  });

  it("hides every feedback surface when revealFeedback is false and marks the selection with aria-pressed", () => {
    // AC 3.18.3
    render(
      <QuizRenderer
        item={{ ...mockItem, correctAnswerSpeech: [{ text: "four", lang: "en" }] } as never}
        options={["3", "4", "5", "6"]}
        selectedAnswer="3"
        showAnswer={true}
        revealFeedback={false}
        onAnswerSelect={vi.fn()}
        stats={{ total: 1, correct: 0 }}
      />
    );
    expect(screen.getByRole("button", { name: /^A. 3$/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /^B. 4$/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /^B. 4$/ })).toBeEnabled();
    expect(screen.queryByText(/Correct Answer/)).toBeNull();
    expect(screen.queryByText("Basic addition.")).toBeNull();
    expect(screen.queryByText(/Score:/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Read answer aloud" })).toBeNull();
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/bg-green|bg-red|border-green|border-red/);
  });
});
