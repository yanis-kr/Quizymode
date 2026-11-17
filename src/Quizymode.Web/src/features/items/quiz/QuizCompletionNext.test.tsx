import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QuizCompletionView } from "./QuizCompletionView";
import { createQuizRun, reduceQuizRun, type QuizRunState } from "./quizRun";
import type { ItemResponse } from "@/types/api";

vi.mock("@/features/auth/components/SignupPrompt", () => ({ SignupPrompt: () => null }));
vi.mock("./quizAnalytics", () => ({ trackQuizResultShared: vi.fn() }));

const ids = ["a", "b", "c", "d", "e"];
const items = ids.map((id) => ({ id, question: `Q ${id}`, correctAnswer: "r", incorrectAnswers: ["w"], explanation: "" }) as unknown as ItemResponse);

function finishedRun(): QuizRunState {
  let run = createQuizRun({ kind: "category", category: "Exams", navigationKeywords: ["aws"], filterKeywords: [], quizSize: 5 }, ids, "anon");
  for (const id of ids) {
    run = reduceQuizRun(run, { type: "answer", itemId: id, selectedAnswer: "x", isCorrect: true, completedAt: "2026-01-01T00:00:00Z" });
  }
  return { ...run, view: "summary" };
}

function renderView(extra: Partial<Parameters<typeof QuizCompletionView>[0]>) {
  return render(
    <MemoryRouter>
      <QuizCompletionView
        run={finishedRun()}
        items={items}
        browsePath="/x"
        browseLabel="Browse"
        onReviewMistakes={() => {}}
        onBackToResults={() => {}}
        onPlayAgain={() => {}}
        {...extra}
      />
    </MemoryRouter>,
  );
}

describe("QuizCompletionView next round (#711)", () => {
  it("AC 3.6.32 shows Next 5 questions as the action and relabels Play again as same questions", async () => {
    const onNext = vi.fn();
    renderView({ nextRound: { size: 5, exhausted: false, total: 0, onNext } });
    const user = userEvent.setup({ delay: null });
    await user.click(screen.getByRole("button", { name: "Next 5 questions" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Play again (same questions)" })).toBeInTheDocument();
  });

  it("AC 3.6.32 says you have seen the whole set and offers Start over when no unseen question is left", () => {
    renderView({ nextRound: { size: 5, exhausted: true, total: 12, onNext: () => {} } });
    expect(screen.getByRole("status")).toHaveTextContent("You have seen all 12.");
    expect(screen.queryByRole("button", { name: "Next 5 questions" })).toBeNull();
    expect(screen.getByRole("button", { name: "Start over" })).toBeInTheDocument();
  });

  it("renders the Keep going block under the actions", () => {
    renderView({ keepGoing: <div data-testid="keep-going-slot">Keep going</div> });
    expect(screen.getByTestId("keep-going-slot")).toBeInTheDocument();
  });

  it("keeps the plain Play again label when no next round is offered (Daily and starter are unchanged)", () => {
    renderView({});
    expect(screen.getByRole("button", { name: "Play again" })).toBeInTheDocument();
  });
});
