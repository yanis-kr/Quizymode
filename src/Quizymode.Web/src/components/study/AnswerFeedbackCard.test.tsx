import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";
import type { ItemResponse } from "@/types/api";
import { AnswerFeedbackCard } from "./AnswerFeedbackCard";

vi.mock("@/hooks/useSpeech", () => ({ useSpeech: () => ({ isSupported: true }) }));

function makeItem(overrides: Partial<ItemResponse> = {}): ItemResponse {
  return {
    id: "i1",
    category: "trivia",
    isPrivate: false,
    question: "Q?",
    correctAnswer: "Paris",
    incorrectAnswers: ["Rome", "Oslo"],
    incorrectAnswerRationale: { 0: "Rome is the capital of Italy." },
    explanation: "Paris sits on the Seine.",
    createdAt: "2026-01-01T00:00:00Z",
    keywords: [],
    collections: [],
    ...overrides,
  };
}

function renderCard(props: Partial<ComponentProps<typeof AnswerFeedbackCard>> = {}) {
  const onNext = vi.fn();
  const view = render(
    <MemoryRouter>
      <AnswerFeedbackCard
        item={makeItem()}
        selectedAnswer="Paris"
        isCorrect
        fact="Paris sits on the Seine."
        isLast={false}
        onNext={onNext}
        {...props}
      />
    </MemoryRouter>,
  );
  return { onNext, ...view };
}

describe("AnswerFeedbackCard", () => {
  it("correct: verdict, answer and fact; no 'You picked' line", () => {
    renderCard();
    expect(screen.getByText("Correct!")).toBeInTheDocument();
    expect(screen.queryByText(/You picked/)).toBeNull();
    expect(screen.getByText(/Answer:/)).toHaveTextContent("Answer: Paris");
    expect(screen.getByText("Did you know?")).toBeInTheDocument();
    expect(screen.getByText("Paris sits on the Seine.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read answer aloud" })).toBeInTheDocument();
  });

  it("wrong: shows what was picked and the reason for that option", () => {
    renderCard({ selectedAnswer: "Rome", isCorrect: false });
    expect(screen.getByText("Not quite.")).toBeInTheDocument();
    expect(screen.getByText(/You picked:/)).toHaveTextContent("You picked: Rome");
    expect(screen.getByTestId("option-rationale")).toHaveTextContent("Rome is the capital of Italy.");
  });

  it("wrong without a rationale for the picked option shows no rationale", () => {
    renderCard({ selectedAnswer: "Oslo", isCorrect: false });
    expect(screen.queryByTestId("option-rationale")).toBeNull();
  });

  it("omits the label and block when there is no fact", () => {
    renderCard({ fact: "" });
    expect(screen.queryByText("Did you know?")).toBeNull();
    expect(screen.getByText(/Answer:/)).toBeInTheDocument();
  });

  it("shows the explanation picture only inside the revealed card, and nothing when the item has none", () => {
    const withPicture = makeItem({ explanationImage: { key: "curated:flags/zz", altText: "Not bundled" } });
    const { unmount } = renderCard({ item: withPicture });
    expect(screen.getByTestId("answer-feedback-card")).toHaveTextContent("Picture isn't available");
    unmount();
    renderCard();
    expect(screen.queryByText(/Picture isn't available/)).toBeNull();
  });

  it("labels the button 'See my score' on the last question and focuses it", async () => {
    renderCard({ isLast: true });
    const button = screen.getByRole("button", { name: "See my score" });
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("renders no button when there is nothing to advance to", () => {
    renderCard({ onNext: undefined });
    expect(screen.queryByRole("button", { name: /^(Next|See my score)$/ })).toBeNull();
  });

  it("Next advances once; the card itself is not clickable by default", () => {
    const { onNext } = renderCard();
    fireEvent.click(screen.getByTestId("answer-feedback-card"));
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  describe("advanceOnCardClick (starter)", () => {
    it("advances on a click on the card body", () => {
      const { onNext } = renderCard({ advanceOnCardClick: true });
      fireEvent.click(screen.getByText("Paris sits on the Seine."));
      expect(onNext).toHaveBeenCalledTimes(1);
    });

    it("ignores clicks that come from a button or link inside the card, and Next advances exactly once", () => {
      const { onNext } = renderCard({ advanceOnCardClick: true, fact: "See https://example.com/more for details." });
      fireEvent.click(screen.getByRole("button", { name: "Read answer aloud" }));
      fireEvent.click(screen.getByRole("link", { name: /example\.com/ }));
      expect(onNext).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
      expect(onNext).toHaveBeenCalledTimes(1);
    });
  });
});
